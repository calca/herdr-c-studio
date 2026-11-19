#!/bin/bash
# Reports Copilot CLI status to Herdr via OSC 7501: working | blocked | idle | done
state="${1:-idle}"
input=$(cat 2>/dev/null)

# Waiting on the person: a question to them (ask_user) or an attention
# notification (a permission prompt). permissionRequest is not used: it fires
# before the rules, for every tool, even ones that are allowed.
case "$state" in
  notify)
    case "$input" in
      *'"notification_type":"permission'*|*'"notification_type":"elicitation'*|*'"notification_type":"question'*|*'"notification_type":"input'*) state=blocked ;;
      *) exit 0 ;;
    esac ;;
  pre)
    case "$input" in *'"toolName":"ask_user"'*) state=blocked ;; *) state=working ;; esac ;;
esac

pid=$$
tty=""
for _ in 1 2 3 4 5 6 7 8; do
  t=$(ps -o tty= -p "$pid" 2>/dev/null | tr -d ' ')
  if [ -n "$t" ] && [ "$t" != "??" ]; then tty="/dev/$t"; break; fi
  pid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
  [ -z "$pid" ] || [ "$pid" = "1" ] && break
done

[ -n "$tty" ] && [ -w "$tty" ] && printf '\033]7501;state=%s:app=copilot\033\\' "$state" > "$tty"
exit 0
