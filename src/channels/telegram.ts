import { Bot, InputFile } from 'grammy';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

import { ASSISTANT_NAME, DATA_DIR, TIMEZONE, TRIGGER_PATTERN } from '../config.js';
import { logger } from '../logger.js';
import {
  Channel,
  FileAttachment,
  OnChatMetadata,
  OnInboundMessage,
  RegisteredGroup,
} from '../types.js';

export interface TelegramChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
  getActiveTasks?: () => {
    id: string;
    prompt: string;
    schedule_type: string;
    schedule_value: string;
    status: string;
    next_run: string | null;
    group_folder: string;
  }[];
}


/**
 * Convert markdown-ish text to Telegram HTML.
 * Telegram supports: <b>, <i>, <code>, <pre>, <a>, <s>, <u>, <blockquote>
 * This handles common agent output patterns gracefully.
 */
function mdToTelegramHtml(text: string): string {
  // Escape HTML entities first
  let out = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (``` ... ```)
  out = out.replace(/```(?:\w+)?\n([\s\S]*?)```/g, '<pre>$1</pre>');

  // Inline code (`...`)
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold (**...**  or __...__)
  out = out.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  out = out.replace(/__(.+?)__/g, '<b>$1</b>');

  // Italic (*...*  or _..._) — but not inside words
  out = out.replace(/(?<![\w*])\*([^*]+?)\*(?![\w*])/g, '<i>$1</i>');
  out = out.replace(/(?<![\w_])_([^_]+?)_(?![\w_])/g, '<i>$1</i>');

  // Strikethrough (~~...~~)
  out = out.replace(/~~(.+?)~~/g, '<s>$1</s>');

  // Headers (## ...) → bold
  out = out.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>');

  // Links [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  return out;
}

// --- File download helpers ---

const UPLOADS_BASE = path.join(DATA_DIR, 'uploads');
const MAX_FILE_SIZE = 20 * 1024 * 1024; // Telegram bot API limit: 20MB

/**
 * Download a file from a URL to a local path.
 */
function downloadFile(url: string, destPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    proto.get(url, (response) => {
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`Download failed: HTTP ${response.statusCode}`));
        return;
      }
      let size = 0;
      response.on('data', (chunk: Buffer) => { size += chunk.length; });
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(size); });
    }).on('error', (err) => {
      file.close();
      try { fs.unlinkSync(destPath); } catch { /* ignore */ }
      reject(err);
    });
  });
}

/**
 * Sanitize a filename for safe filesystem storage.
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
}

/**
 * Determine MIME type from filename extension.
 */
function mimeFromFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.csv': 'text/csv', '.txt': 'text/plain', '.md': 'text/markdown',
    '.json': 'application/json', '.xml': 'application/xml',
    '.zip': 'application/zip', '.tar': 'application/x-tar',
    '.gz': 'application/gzip',
    '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.avi': 'video/x-msvideo',
    '.oga': 'audio/ogg',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

/**
 * Clean up uploads older than 24 hours.
 */
function cleanupOldUploads(): void {
  try {
    if (!fs.existsSync(UPLOADS_BASE)) return;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const groupDir of fs.readdirSync(UPLOADS_BASE)) {
      const groupPath = path.join(UPLOADS_BASE, groupDir);
      if (!fs.statSync(groupPath).isDirectory()) continue;
      for (const file of fs.readdirSync(groupPath)) {
        const filePath = path.join(groupPath, file);
        try {
          const stat = fs.statSync(filePath);
          if (stat.mtimeMs < cutoff) {
            fs.unlinkSync(filePath);
            logger.debug({ file: filePath }, 'Cleaned up old upload');
          }
        } catch { /* ignore individual file errors */ }
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Upload cleanup error');
  }
}


export class TelegramChannel implements Channel {
  name = 'telegram';

  private bot: Bot | null = null;
  private opts: TelegramChannelOpts;
  private botToken: string;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(botToken: string, opts: TelegramChannelOpts) {
    this.botToken = botToken;
    this.opts = opts;
  }

  /**
   * Download a file from Telegram servers and save to uploads directory.
   */
  private async downloadTelegramFile(
    fileId: string,
    filename: string,
    mimeType: string,
    groupFolder: string,
  ): Promise<FileAttachment | null> {
    try {
      if (!this.bot) return null;

      // Get file info from Telegram
      const fileInfo = await this.bot.api.getFile(fileId);
      if (!fileInfo.file_path) {
        logger.warn({ fileId }, 'Telegram file has no file_path');
        return null;
      }

      // Check file size
      if (fileInfo.file_size && fileInfo.file_size > MAX_FILE_SIZE) {
        logger.warn({ fileId, size: fileInfo.file_size }, 'File too large to download');
        return null;
      }

      // Build download URL
      const downloadUrl = `https://api.telegram.org/file/bot${this.botToken}/${fileInfo.file_path}`;

      // Ensure uploads directory exists
      const uploadsDir = path.join(UPLOADS_BASE, groupFolder);
      fs.mkdirSync(uploadsDir, { recursive: true });

      // Save with timestamp prefix to avoid collisions
      const safeFilename = sanitizeFilename(filename);
      const localFilename = `${Date.now()}_${safeFilename}`;
      const localPath = path.join(uploadsDir, localFilename);

      // Download
      const fileSize = await downloadFile(downloadUrl, localPath);

      logger.info({ fileId, filename, localPath, fileSize }, 'Downloaded Telegram file');

      return {
        filename: safeFilename,
        mimeType,
        localPath,
        fileSize,
        telegramFileId: fileId,
      };
    } catch (err) {
      logger.error({ fileId, filename, err }, 'Failed to download Telegram file');
      return null;
    }
  }

  async connect(): Promise<void> {
    this.bot = new Bot(this.botToken);

    // Start periodic upload cleanup (every hour)
    cleanupOldUploads();
    this.cleanupInterval = setInterval(cleanupOldUploads, 60 * 60 * 1000);

    // --- Agent commands: rewrite to natural language and route through pipeline ---
    const agentCommands: Record<string, string> = {
      '/briefing': `Give me a briefing right now. Cover pending tasks, recent activity, anything I should know about.`,
      '/recap': `Give me a quick recap of recent activity and any pending items.`,
      '/costs': `Give me a quick cost breakdown for the last 24 hours. Show per-task spend and total.`,
    };

    // --- Gateway commands (instant, no container) ---

    this.bot.command('chatid', (ctx) => {
      const chatId = ctx.chat.id;
      const chatType = ctx.chat.type;
      const chatName =
        chatType === 'private'
          ? ctx.from?.first_name || 'Private'
          : (ctx.chat as any).title || 'Unknown';

      ctx.reply(
        `Chat ID: \`tg:${chatId}\`\nName: ${chatName}\nType: ${chatType}`,
        { parse_mode: 'Markdown' },
      );
    });

    this.bot.command('ping', (ctx) => {
      const uptime = process.uptime();
      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const uptimeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
      ctx.reply(`Online. Uptime: ${uptimeStr}`);
    });

    this.bot.command('start', (ctx) => {
      const name = ctx.from?.first_name || 'boss';
      ctx.reply(
        [
          `Hey ${name}. ${ASSISTANT_NAME} here — your Chief of Staff.`,
          '',
          'Just talk to me. I manage your staff, run briefings, track costs, handle research, crunch files, and keep the infrastructure alive.',
          '',
          'A few shortcuts if you want them:',
          '/briefing — what you need to know right now',
          '/tasks — the full schedule',
          '/help — everything else',
        ].join('\n'),
        { parse_mode: 'Markdown' },
      );
    });

    this.bot.command('help', (ctx) => {
      ctx.reply(
        [
          `*${ASSISTANT_NAME}*`,
          '',
          'Just type what you need. No special syntax.',
          '',
          '*Shortcuts*',
          '/briefing — Morning-style briefing on demand',
          '/recap — Quick summary of recent activity',
          '/costs — Last 24h spend breakdown',
          '/tasks — Full staff schedule',
          '/status — System vitals',
          '/ping — Am I alive?',
          '',
          '*Files*',
          'Send me anything — docs, images, spreadsheets, code. I\'ll figure it out.',
          '',
          '*Staff*',
          'Specialized agents run on schedule. Use /tasks to see what\'s active.',
        ].join('\n'),
        { parse_mode: 'Markdown' },
      );
    });

    this.bot.command('status', (ctx) => {
      const uptime = process.uptime();
      const days = Math.floor(uptime / 86400);
      const hours = Math.floor((uptime % 86400) / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const uptimeStr = days > 0
        ? `${days}d ${hours}h ${minutes}m`
        : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

      const mem = process.memoryUsage();
      const heapMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
      const rssMB = (mem.rss / 1024 / 1024).toFixed(1);

      const tasks = this.opts.getActiveTasks?.() || [];
      const recurringCount = tasks.filter((t) => (t as any).task_class !== 'ephemeral').length;
      const ephemeralCount = tasks.length - recurringCount;
      const groups = Object.keys(this.opts.registeredGroups()).length;

      const taskLine = ephemeralCount > 0
        ? `${tasks.length} tasks (${recurringCount} recurring, ${ephemeralCount} planned)`
        : `${tasks.length} tasks`;

      ctx.reply(
        [
          `*Status*`,
          '',
          `Uptime: ${uptimeStr}`,
          `Memory: ${heapMB} MB heap / ${rssMB} MB RSS`,
          `Schedule: ${taskLine}`,
          `Chats: ${groups}`,
          `Node: ${process.version}`,
        ].join('\n'),
        { parse_mode: 'Markdown' },
      );
    });

    this.bot.command('tasks', (ctx) => {
      const tasks = this.opts.getActiveTasks?.() || [];

      if (tasks.length === 0) {
        ctx.reply('No scheduled tasks.');
        return;
      }

      // Infer name from task ID or prompt
      const getTaskName = (t: { id: string; prompt: string }): string => {
        // Clean up ID into readable form: strip prefix before first dash, humanize
        const cleaned = t.id
          .replace(/^[a-z]+-/, '')
          .replace(/-/g, ' ');
        return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      };

      // Dynamic grouping: extract prefix from task ID, auto-assign emoji
      const prefixEmojis: Record<string, string> = {};
      const defaultEmojis = ['📋', '💼', '📊', '📚', '🔧', '🏗', '⚡', '🔔', '📦', '🎯'];
      let emojiIdx = 0;

      const getGroupLabel = (prefix: string): string => {
        if (!prefixEmojis[prefix]) {
          prefixEmojis[prefix] = defaultEmojis[emojiIdx % defaultEmojis.length];
          emojiIdx++;
        }
        return `${prefixEmojis[prefix]} ${prefix.charAt(0).toUpperCase() + prefix.slice(1)}`;
      };

      const formatNext = (nextRun: string | null): string => {
        if (!nextRun) return '⏸';
        const d = new Date(nextRun);
        const now = new Date();
        const diffH = (d.getTime() - now.getTime()) / 3600000;
        const time = d.toLocaleString('en-GB', {
          timeZone: TIMEZONE,
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });
        // Add relative hint for tasks coming soon
        if (diffH > 0 && diffH < 2) return `${time} ⏰`;
        return time;
      };

      // Group tasks by prefix (part before first dash)
      const grouped = new Map<string, typeof tasks>();
      let ephemeralCount = 0;
      for (const t of tasks) {
        const prefix = t.id.split('-')[0] || 'other';
        if (!grouped.has(prefix)) grouped.set(prefix, []);
        grouped.get(prefix)!.push(t);
      }

      const sections: string[] = [];
      for (const [prefix, groupTasks] of grouped) {
        const label = getGroupLabel(prefix);
        const recurring = groupTasks.filter((t) => (t as any).task_class !== 'ephemeral');
        const ephemeral = groupTasks.filter((t) => (t as any).task_class === 'ephemeral');
        ephemeralCount += ephemeral.length;

        const lines = recurring
          .sort((a, b) => (a.next_run || '').localeCompare(b.next_run || ''))
          .map((t) => `  ▸ ${getTaskName(t)} → ${formatNext(t.next_run)}`);

        if (ephemeral.length > 0) {
          const nextEph = ephemeral.sort((a, b) => (a.next_run || '').localeCompare(b.next_run || ''))[0];
          lines.push(`  ▸ +${ephemeral.length} planned (next: ${formatNext(nextEph.next_run)})`);
        }

        sections.push(`${label} (${groupTasks.length})\n${lines.join('\n')}`);
      }

      const header = ephemeralCount > 0
        ? `📋 *${tasks.length} tasks* (${tasks.length - ephemeralCount} recurring, ${ephemeralCount} planned)`
        : `📋 *${tasks.length} tasks*`;

      ctx.reply(
        [header, '', ...sections].join('\n'),
        { parse_mode: 'Markdown' },
      );
    });

    // --- Helper to resolve group folder for a chat ---
    const resolveGroupFolder = (chatJid: string): string | null => {
      const group = this.opts.registeredGroups()[chatJid];
      return group ? group.folder : null;
    };

    // --- Text message handler ---

    this.bot.on('message:text', async (ctx) => {
      const text = ctx.message.text.trim();

      // Check for agent-routed commands first
      const cmd = text.split(/\s/)[0]?.toLowerCase();
      const agentPrompt = agentCommands[cmd];
      if (agentPrompt) {
        // Rewrite content to the agent prompt, fall through to normal processing
        ctx.message.text = agentPrompt;
      } else if (text.startsWith('/')) {
        // Skip other unhandled commands (already handled above or unknown)
        return;
      }

      const chatJid = `tg:${ctx.chat.id}`;
      let content = ctx.message.text;
      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName =
        ctx.from?.first_name ||
        ctx.from?.username ||
        ctx.from?.id.toString() ||
        'Unknown';
      const sender = ctx.from?.id.toString() || '';
      const msgId = ctx.message.message_id.toString();

      // Determine chat name
      const chatName =
        ctx.chat.type === 'private'
          ? senderName
          : (ctx.chat as any).title || chatJid;

      // Translate Telegram @bot_username mentions into TRIGGER_PATTERN format.
      const botUsername = ctx.me?.username?.toLowerCase();
      if (botUsername) {
        const entities = ctx.message.entities || [];
        const isBotMentioned = entities.some((entity) => {
          if (entity.type === 'mention') {
            const mentionText = content
              .substring(entity.offset, entity.offset + entity.length)
              .toLowerCase();
            return mentionText === `@${botUsername}`;
          }
          return false;
        });
        if (isBotMentioned && !TRIGGER_PATTERN.test(content)) {
          content = `@${ASSISTANT_NAME} ${content}`;
        }
      }

      // Store chat metadata for discovery
      const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      this.opts.onChatMetadata(chatJid, timestamp, chatName, 'telegram', isGroup);

      // Only deliver full message for registered groups
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) {
        logger.debug(
          { chatJid, chatName },
          'Message from unregistered Telegram chat',
        );
        return;
      }

      // Deliver message — startMessageLoop() will pick it up
      this.opts.onMessage(chatJid, {
        id: msgId,
        chat_jid: chatJid,
        sender,
        sender_name: senderName,
        content,
        timestamp,
        is_from_me: false,
      });

      logger.info(
        { chatJid, chatName, sender: senderName },
        'Telegram message stored',
      );
    });

    // --- File message handlers (download + deliver) ---

    /**
     * Store a message with file attachment(s).
     * Downloads the file from Telegram servers, then delivers the message
     * with both a text description and the files array.
     */
    const storeWithFile = async (
      ctx: any,
      fileId: string,
      filename: string,
      mimeType: string,
      textPrefix: string,
    ) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) return;

      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName =
        ctx.from?.first_name ||
        ctx.from?.username ||
        ctx.from?.id?.toString() ||
        'Unknown';
      const caption = ctx.message.caption ? ` ${ctx.message.caption}` : '';

      const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      this.opts.onChatMetadata(chatJid, timestamp, undefined, 'telegram', isGroup);

      // Download the file
      const attachment = await this.downloadTelegramFile(
        fileId,
        filename,
        mimeType,
        group.folder,
      );

      const files: FileAttachment[] = attachment ? [attachment] : [];
      const fileDesc = attachment
        ? `${textPrefix}: ${filename} (${(attachment.fileSize / 1024).toFixed(0)}KB)`
        : `${textPrefix} (download failed)`;

      // Build content: include caption if present, otherwise describe the file
      let content = caption ? caption.trim() : fileDesc;
      // If there's a caption, also prepend the file info
      if (caption && attachment) {
        content = `${fileDesc}\n${caption.trim()}`;
      }

      this.opts.onMessage(chatJid, {
        id: ctx.message.message_id.toString(),
        chat_jid: chatJid,
        sender: ctx.from?.id?.toString() || '',
        sender_name: senderName,
        content,
        timestamp,
        is_from_me: false,
        files,
      });

      logger.info(
        { chatJid, filename, hasAttachment: !!attachment },
        'File message stored',
      );
    };

    // Photos: use largest size
    this.bot.on('message:photo', async (ctx) => {
      const photos = ctx.message.photo;
      if (!photos || photos.length === 0) return;
      const largest = photos[photos.length - 1];
      const filename = `photo_${Date.now()}.jpg`;
      await storeWithFile(ctx, largest.file_id, filename, 'image/jpeg', '[Photo]');
    });

    // Documents: preserve original filename
    this.bot.on('message:document', async (ctx) => {
      const doc = ctx.message.document;
      if (!doc) return;
      const filename = doc.file_name || `document_${Date.now()}`;
      const mimeType = doc.mime_type || mimeFromFilename(filename);
      await storeWithFile(ctx, doc.file_id, filename, mimeType, `[Document: ${filename}]`);
    });

    // Voice messages
    this.bot.on('message:voice', async (ctx) => {
      const voice = ctx.message.voice;
      if (!voice) return;
      const filename = `voice_${Date.now()}.ogg`;
      await storeWithFile(ctx, voice.file_id, filename, 'audio/ogg', '[Voice message]');
    });

    // Audio files
    this.bot.on('message:audio', async (ctx) => {
      const audio = ctx.message.audio;
      if (!audio) return;
      const filename = audio.file_name || `audio_${Date.now()}.mp3`;
      const mimeType = audio.mime_type || 'audio/mpeg';
      await storeWithFile(ctx, audio.file_id, filename, mimeType, '[Audio]');
    });

    // Video
    this.bot.on('message:video', async (ctx) => {
      const video = ctx.message.video;
      if (!video) return;
      const filename = video.file_name || `video_${Date.now()}.mp4`;
      const mimeType = video.mime_type || 'video/mp4';
      await storeWithFile(ctx, video.file_id, filename, mimeType, '[Video]');
    });

    // Video notes (circular videos)
    this.bot.on('message:video_note', async (ctx) => {
      const vn = ctx.message.video_note;
      if (!vn) return;
      const filename = `videonote_${Date.now()}.mp4`;
      await storeWithFile(ctx, vn.file_id, filename, 'video/mp4', '[Video note]');
    });

    // Stickers, location, contact — keep as text-only placeholders (low value)
    const storeNonText = (ctx: any, placeholder: string) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) return;

      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName =
        ctx.from?.first_name ||
        ctx.from?.username ||
        ctx.from?.id?.toString() ||
        'Unknown';
      const caption = ctx.message.caption ? ` ${ctx.message.caption}` : '';

      const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      this.opts.onChatMetadata(chatJid, timestamp, undefined, 'telegram', isGroup);
      this.opts.onMessage(chatJid, {
        id: ctx.message.message_id.toString(),
        chat_jid: chatJid,
        sender: ctx.from?.id?.toString() || '',
        sender_name: senderName,
        content: `${placeholder}${caption}`,
        timestamp,
        is_from_me: false,
      });
    };

    this.bot.on('message:sticker', (ctx) => {
      const emoji = ctx.message.sticker?.emoji || '';
      storeNonText(ctx, `[Sticker ${emoji}]`);
    });
    this.bot.on('message:location', (ctx) => storeNonText(ctx, '[Location]'));
    this.bot.on('message:contact', (ctx) => storeNonText(ctx, '[Contact]'));

    // Handle errors gracefully
    this.bot.catch((err) => {
      logger.error({ err: err.message }, 'Telegram bot error');
    });

    // Start polling — returns a Promise that resolves when started
    return new Promise<void>((resolve) => {
      this.bot!.start({
        onStart: async (botInfo) => {
          logger.info(
            { username: botInfo.username, id: botInfo.id },
            'Telegram bot connected',
          );
          console.log(`\n  Telegram bot: @${botInfo.username}`);
          console.log(
            `  Send /chatid to the bot to get a chat's registration ID\n`,
          );

          // Register commands with BotFather for the menu
          try {
            await this.bot!.api.setMyCommands([
              { command: 'briefing', description: 'What you need to know right now' },
              { command: 'recap', description: 'Recent activity summary' },
              { command: 'costs', description: 'Last 24h spend breakdown' },
              { command: 'tasks', description: 'Full staff schedule' },
              { command: 'status', description: 'System vitals' },
              { command: 'ping', description: 'Quick pulse check' },
              { command: 'help', description: 'All commands and capabilities' },
            ]);
            logger.info('Telegram bot commands registered');
          } catch (err) {
            logger.warn({ err }, 'Failed to register bot commands with BotFather');
          }

          resolve();
        },
      });
    });
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.bot) {
      logger.warn('Telegram bot not initialized');
      return;
    }

    try {
      const numericId = jid.replace(/^tg:/, '');

      // Telegram has a 4096 character limit per message — split if needed
      const MAX_LENGTH = 4096;
      if (text.length <= MAX_LENGTH) {
        await this.bot.api.sendMessage(numericId, mdToTelegramHtml(text), { parse_mode: 'HTML' });
      } else {
        for (let i = 0; i < text.length; i += MAX_LENGTH) {
          await this.bot.api.sendMessage(
            numericId,
            mdToTelegramHtml(text.slice(i, i + MAX_LENGTH)),
            { parse_mode: 'HTML' },
          );
        }
      }
      logger.info({ jid, length: text.length }, 'Telegram message sent');
    } catch (err) {
      logger.error({ jid, err }, 'Failed to send Telegram message');
    }
  }

  async sendFile(jid: string, buffer: Buffer, filename: string, caption?: string): Promise<void> {
    if (!this.bot) {
      logger.warn('Telegram bot not initialized');
      return;
    }

    try {
      const numericId = jid.replace(/^tg:/, '');
      const inputFile = new InputFile(buffer, filename);
      await this.bot.api.sendDocument(numericId, inputFile, {
        caption: caption || `\u{1F4CE} ${filename}`,
      });
      logger.info({ jid, filename, size: buffer.length }, 'Telegram file sent');
    } catch (err) {
      logger.error({ jid, filename, err }, 'Failed to send Telegram file');
      throw err;
    }
  }

  isConnected(): boolean {
    return this.bot !== null;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('tg:');
  }

  async disconnect(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    if (this.bot) {
      this.bot.stop();
      this.bot = null;
      logger.info('Telegram bot stopped');
    }
  }

  /**
   * Send a message and return its message_id (for later editing).
   */
  async sendMessageWithId(jid: string, text: string): Promise<number | null> {
    if (!this.bot) return null;
    try {
      const numericId = jid.replace(/^tg:/, '');
      const msg = await this.bot.api.sendMessage(numericId, mdToTelegramHtml(text), { parse_mode: 'HTML', disable_notification: true });
      logger.info({ jid, length: text.length, messageId: msg.message_id }, 'Telegram message sent (with id)');
      return msg.message_id;
    } catch (err) {
      logger.error({ jid, err }, 'Failed to send Telegram message');
      return null;
    }
  }

  /**
   * Edit an existing message by its message_id.
   */
  async editMessage(jid: string, messageId: number, text: string): Promise<void> {
    if (!this.bot) return;
    try {
      const numericId = jid.replace(/^tg:/, '');
      await this.bot.api.editMessageText(numericId, messageId, mdToTelegramHtml(text), { parse_mode: 'HTML' });
      logger.debug({ jid, messageId }, 'Telegram message edited');
    } catch (err) {
      // Edit can fail if message is too old or unchanged — not critical
      logger.debug({ jid, messageId, err }, 'Failed to edit Telegram message');
    }
  }

  async setTyping(jid: string, isTyping: boolean): Promise<void> {
    if (!this.bot || !isTyping) return;
    try {
      const numericId = jid.replace(/^tg:/, '');
      await this.bot.api.sendChatAction(numericId, 'typing');
    } catch (err) {
      logger.debug({ jid, err }, 'Failed to send Telegram typing indicator');
    }
  }
}
