#!/bin/bash
export LC_ALL=en_US.UTF-8

# Claude Code Hook Notification Script
# Supports both Stop hook and Notification hook

input=$(cat)

# Common fields
cwd=$(echo "$input" | jq -r '.cwd // empty')
project=$(basename "${cwd:-unknown}")
session_id=$(echo "$input" | jq -r '.session_id // empty')
session_short="${session_id:0:8}"
hook_event=$(echo "$input" | jq -r '.hook_event_name // empty')

# Notification hook fields
notification_type=$(echo "$input" | jq -r '.notification_type // empty')
message=$(echo "$input" | jq -r '.message // empty')
title=$(echo "$input" | jq -r '.title // empty')

# Stop hook fields
stop_hook_active=$(echo "$input" | jq -r '.stop_hook_active // empty')
last_message=$(echo "$input" | jq -r '.last_assistant_message // empty')

# Prevent infinite loop
if [ "$stop_hook_active" = "true" ]; then
    exit 0
fi

# --- Summary function ---
# Extract key points from last_assistant_message and generate notification text
summarize_message() {
    local msg="$1"
    local result=""

    # If empty
    if [ -z "$msg" ]; then
        echo "Task completed"
        return
    fi

    # Method 1: Extract the first 3 bullet point lines (- or * or numbered), excluding table rows
    local bullets
    bullets=$(printf '%s' "$msg" | grep -v '^\s*|' | grep -E '^\s*[-*•]\s+|^\s*[0-9]+[\.\)]\s+' | head -3 | sed 's/^\s*[-*•]\s*//' | sed 's/^\s*[0-9]*[\.\)]\s*//' | sed 's/[*`]//g')
    if [ -n "$bullets" ]; then
        result=$(printf '%s' "$bullets" | tr '\n' ' / ' | cut -c 1-120)
        echo "$result"
        return
    fi

    # Method 2: Extract lines containing key action words (excluding tables and code blocks)
    local key_lines
    key_lines=$(printf '%s' "$msg" | grep -v '^\s*|' | grep -v '^\s*```' | grep -E '完了|修正|追加|削除|更新|作成|実装|変更|設定|解決|fixed|added|created|updated|implemented|resolved|changed' | head -3)
    if [ -n "$key_lines" ]; then
        result=$(printf '%s' "$key_lines" | tr '\n' ' / ' | sed 's/[#*`>|]//g' | sed 's/  */ /g' | cut -c 1-120)
        echo "$result"
        return
    fi

    # Method 3: Extract Markdown headings (## or ###)
    local headings
    headings=$(printf '%s' "$msg" | grep -E '^#{1,3}\s+' | sed 's/^#*\s*//' | head -3)
    if [ -n "$headings" ]; then
        result=$(printf '%s' "$headings" | tr '\n' ' / ' | cut -c 1-120)
        echo "$result"
        return
    fi

    # Fallback: Remove code blocks, tables, and markdown symbols, then get the beginning
    result=$(printf '%s' "$msg" | grep -v '^\s*```' | grep -v '^\s*|' | grep -v '^\s*$' | sed 's/[#*`>]//g' | head -3 | tr '\n' ' ' | cut -c 1-120)
    if [ -n "$result" ]; then
        echo "$result"
        return
    fi

    echo "Task completed"
}

# --- Send notification ---
case "$hook_event" in
    "Stop")
        summary=$(summarize_message "$last_message")
        terminal-notifier \
            -title "Claude Code - Done" \
            -subtitle "$project ($session_short)" \
            -message "$summary" \
            -sound "Glass" \
            -group "claude-code-${session_short}" \
            -ignoreDnD
        ;;
    "Notification")
        case "$notification_type" in
            "permission_prompt")
                terminal-notifier \
                    -title "Claude Code - Awaiting Permission" \
                    -subtitle "$project ($session_short)" \
                    -message "${message:-Tool execution permission is required}" \
                    -sound "Ping" \
                    -group "claude-code-${session_short}" \
                    -ignoreDnD
                ;;
            "idle_prompt")
                terminal-notifier \
                    -title "Claude Code - Awaiting Input" \
                    -subtitle "$project ($session_short)" \
                    -message "${message:-Waiting for your response}" \
                    -sound "Purr" \
                    -group "claude-code-${session_short}" \
                    -ignoreDnD
                ;;
            *)
                terminal-notifier \
                    -title "Claude Code" \
                    -subtitle "$project ($session_short)" \
                    -message "${message:-Notification}" \
                    -sound "default" \
                    -group "claude-code-${session_short}"
                ;;
        esac
        ;;
    *)
        # Fallback: when hook_event_name is not present
        summary=$(summarize_message "$last_message")
        terminal-notifier \
            -title "Claude Code" \
            -subtitle "$project" \
            -message "${summary:-${message:-Notification}}" \
            -sound "Glass" \
            -group "claude-code-fallback" \
            -ignoreDnD
        ;;
esac
