import re

with open("/home/krysp/krysp/src/channels/telegram.ts") as f:
    content = f.read()

new_commands = '''
    // Welcome message when user first opens the bot
    this.bot.command('start', (ctx) => {
      ctx.reply(
        `Hey 👋 I'm *${ASSISTANT_NAME}* — your AI Chief of Staff.\\n\\n` +
        `I run 24/7 on a dedicated VPS. Just message me directly — no trigger word needed in DMs.\\n\\n` +
        `*What I can do:*\\n` +
        `• Answer questions, run research, draft content\\n` +
        `• Track projects, deadlines, and context\\n` +
        `• Send scheduled briefings and alerts\\n` +
        `• Monitor infrastructure health\\n\\n` +
        `Type /help for commands, or just start talking.`,
        { parse_mode: 'Markdown' },
      );
    });

    // Help command — lists available commands
    this.bot.command('help', (ctx) => {
      ctx.reply(
        `*${ASSISTANT_NAME} Commands*\\n\\n` +
        `/start — Welcome message\\n` +
        `/help — This command list\\n` +
        `/ping — Check if I'm online\\n` +
        `/chatid — Get this chat's registration ID\\n` +
        `/status — System status\\n\\n` +
        `*No commands needed* — just message me directly and I'll respond. ` +
        `Ask me to schedule tasks, run research, check infrastructure, or anything else.`,
        { parse_mode: 'Markdown' },
      );
    });

    // Status command — quick system check
    this.bot.command('status', (ctx) => {
      const uptime = process.uptime();
      const hours = Math.floor(uptime / 3600);
      const mins = Math.floor((uptime % 3600) / 60);
      const mem = process.memoryUsage();
      const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
      ctx.reply(
        `*${ASSISTANT_NAME} Status*\\n\\n` +
        `✅ Online\\n` +
        `⏱ Uptime: ${hours}h ${mins}m\\n` +
        `🧠 Memory: ${heapMB}MB heap\\n` +
        `🤖 Gateway PID: ${process.pid}`,
        { parse_mode: 'Markdown' },
      );
    });

'''

target = """    // Command to check bot status
    this.bot.command('ping', (ctx) => {
      ctx.reply(`${ASSISTANT_NAME} is online.`);
    });"""

replacement = target + "\n" + new_commands

content = content.replace(target, replacement)

with open("/home/krysp/krysp/src/channels/telegram.ts", "w") as f:
    f.write(content)

print("Commands added: /start, /help, /status")
