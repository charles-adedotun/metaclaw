#!/usr/bin/env bash
# Host-side executor daemon for MetaClaw
# Polls IPC host/ directories for command requests, executes whitelisted commands,
# writes results to host-results/. Runs as a systemd service alongside metaclaw.
#
# Security model: command whitelist only — agents pick a command name,
# this script maps it to a hardcoded shell snippet. No arbitrary execution.

set -uo pipefail

APP_DIR="${APP_DIR:-/home/${USER}/metaclaw}"
IPC_BASE="${APP_DIR}/data/ipc"
POLL_INTERVAL=2
MAX_OUTPUT_BYTES=65536  # 64KB max output per command

# ─── Startup checks ──────────────────────────────────────────────────

command -v jq >/dev/null 2>&1 || { echo "FATAL: jq is required but not installed"; exit 1; }

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

# ─── Command Whitelist ────────────────────────────────────────────────
# Each function outputs to stdout. Exit code determines success/error.
# Add new commands here — nothing else changes.

cmd_system_health() {
  echo "=== Disk ==="
  df -h / /home 2>/dev/null || df -h /
  echo ""
  echo "=== Memory ==="
  free -h
  echo ""
  echo "=== Uptime ==="
  uptime
  echo ""
  echo "=== Docker Containers ==="
  docker ps --format "table {{.Names}}\t{{.Status}}\t{{.RunningFor}}" 2>&1 || echo "Docker command failed"
  echo ""
  echo "=== Docker Images ==="
  docker images metaclaw-agent --format "{{.Repository}}:{{.Tag}} {{.Size}} ({{.CreatedSince}})" 2>&1 || echo "No metaclaw-agent image"
}

cmd_service_status() {
  echo "=== Service ==="
  systemctl is-active metaclaw 2>/dev/null || echo "unknown"
  echo ""
  echo "=== Started At ==="
  systemctl show metaclaw --property=ActiveEnterTimestamp --value 2>/dev/null || echo "unknown"
  echo ""
  echo "=== PID ==="
  systemctl show metaclaw --property=MainPID --value 2>/dev/null || echo "unknown"
  echo ""
  echo "=== Memory Usage ==="
  systemctl show metaclaw --property=MemoryCurrent --value 2>/dev/null || echo "unknown"
}

cmd_journal_errors() {
  sudo journalctl -u metaclaw --since "1 hour ago" -p err --no-pager --output=cat 2>/dev/null || echo "No errors found"
}

# ─── Command Dispatch ────────────────────────────────────────────────

# Whitelist validation — returns 0 if command is allowed
is_whitelisted() {
  case "$1" in
    system_health|service_status|journal_errors) return 0 ;;
    *) return 1 ;;
  esac
}

run_command() {
  local cmd="$1"
  case "$cmd" in
    system_health)   cmd_system_health ;;
    service_status)  cmd_service_status ;;
    journal_errors)  cmd_journal_errors ;;
    *)
      echo "Unknown command: ${cmd}"
      return 1
      ;;
  esac
}

# ─── Request Processing ──────────────────────────────────────────────

write_error_result() {
  local results_dir="$1" request_id="$2" command="$3" message="$4"
  local result_file="${results_dir}/${request_id}.json"
  local tmp_file="${result_file}.tmp"
  printf '{"id":"%s","command":"%s","status":"error","exit_code":1,"output":"%s","timestamp":"%s"}\n' \
    "$request_id" "$command" "$message" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$tmp_file" 2>/dev/null
  mv "$tmp_file" "$result_file" 2>/dev/null || true
}

process_request() {
  local request_file="$1"
  local group_dir group_name
  group_dir="$(dirname "$(dirname "$request_file")")"
  group_name="$(basename "$group_dir")"
  local results_dir="${group_dir}/host-results"

  # Authorization: only main group can use host commands
  if [[ "$group_name" != "main" ]]; then
    log "REJECTED: host command from non-main group '${group_name}'"
    rm -f "$request_file"
    return 0
  fi

  mkdir -p "$results_dir"

  # Parse request JSON
  local request_id command timeout_ms
  request_id="$(jq -r '.id // empty' "$request_file" 2>/dev/null)" || true
  command="$(jq -r '.command // empty' "$request_file" 2>/dev/null)" || true
  timeout_ms="$(jq -r '.timeout_ms // 30000' "$request_file" 2>/dev/null)" || true

  if [[ -z "$request_id" || -z "$command" ]]; then
    log "WARN: Malformed request in ${request_file}, skipping"
    rm -f "$request_file"
    return 0
  fi

  # Whitelist validation — before any execution
  if ! is_whitelisted "$command"; then
    log "REJECTED: Unknown command '${command}' (id=${request_id})"
    write_error_result "$results_dir" "$request_id" "$command" "Command not in whitelist: ${command}"
    rm -f "$request_file"
    return 0
  fi

  log "EXEC: ${command} (id=${request_id}, timeout=${timeout_ms}ms)"

  local timeout_s=$(( timeout_ms / 1000 ))
  [[ "$timeout_s" -lt 1 ]] && timeout_s=1
  [[ "$timeout_s" -gt 60 ]] && timeout_s=60

  # Execute via bash -c (required because timeout can't call shell functions).
  # Command is already validated against the whitelist above, and passed as
  # a positional argument ($1) — never interpolated into the script string.
  local output exit_code
  output="$(timeout "${timeout_s}" bash -c \
    "$(declare -f cmd_system_health cmd_service_status cmd_journal_errors run_command); run_command \"\$1\"" \
    _ "$command" 2>&1 | head -c "$MAX_OUTPUT_BYTES")" && exit_code=0 || exit_code=$?

  local status="success"
  if [[ "$exit_code" -eq 124 ]]; then
    status="timeout"
    output="Command timed out after ${timeout_s}s"
  elif [[ "$exit_code" -ne 0 ]]; then
    status="error"
  fi

  # Write result file (atomic)
  local result_file="${results_dir}/${request_id}.json"
  local tmp_file="${result_file}.tmp"
  if ! jq -n \
    --arg id "$request_id" \
    --arg command "$command" \
    --arg status "$status" \
    --arg output "$output" \
    --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --argjson exit_code "$exit_code" \
    '{id: $id, command: $command, status: $status, exit_code: $exit_code, output: $output, timestamp: $timestamp}' \
    > "$tmp_file" 2>/dev/null; then
    log "ERROR: Failed to serialize result JSON for ${request_id}"
    write_error_result "$results_dir" "$request_id" "$command" "Internal: result serialization failed"
    rm -f "$request_file" "$tmp_file"
    return 0
  fi
  mv "$tmp_file" "$result_file"

  log "DONE: ${command} -> ${status} (exit=${exit_code})"

  # Remove processed request
  rm -f "$request_file"
}

# ─── Main Loop ────────────────────────────────────────────────────────

log "Host executor starting (poll=${POLL_INTERVAL}s, app=${APP_DIR})"

# Clean up stale files on startup
find "${IPC_BASE}"/*/host-results/ -name '*.json' -mmin +60 -delete 2>/dev/null || true
find "${IPC_BASE}"/*/host/ -name '*.json' -mmin +5 -delete 2>/dev/null || true

while true; do
  # Scan main group IPC directory for host command requests
  for host_dir in "${IPC_BASE}"/*/host/; do
    [[ -d "$host_dir" ]] || continue

    for request_file in "${host_dir}"*.json; do
      [[ -f "$request_file" ]] || continue
      if ! process_request "$request_file"; then
        log "ERROR: Failed to process ${request_file}, removing to prevent crash loop"
        rm -f "$request_file"
      fi
    done
  done

  sleep "$POLL_INTERVAL"
done
