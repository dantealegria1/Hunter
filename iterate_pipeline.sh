#!/usr/bin/env bash
set -e

if ! command -v jq &> /dev/null; then
    echo "Error: 'jq' is required. Install with: sudo apt install jq"
    exit 1
fi

TASKS_FILE=".agents/tasks.json"
COMPLETED_FILE=".agents/completed_tasks.json"

if [ ! -f "$TASKS_FILE" ]; then
    echo "Error: $TASKS_FILE does not exist."
    exit 1
fi

# Initialize completed tasks file if missing
if [ ! -f "$COMPLETED_FILE" ]; then
    echo "[]" > "$COMPLETED_FILE"
fi

TOTAL_TASKS=$(jq '. | length' "$TASKS_FILE")
echo "Found $TOTAL_TASKS tasks in $TASKS_FILE."

for ((i=0; i<$TOTAL_TASKS; i++)); do
  CURRENT_TASK_ID=$(jq -r ".[$i].id" "$TASKS_FILE")
  CURRENT_TASK_TITLE=$(jq -r ".[$i].title" "$TASKS_FILE")
  CURRENT_TASK_SCOPE=$(jq -r ".[$i].scope" "$TASKS_FILE")

  # Check if task ID is already present in completed_tasks.json
  IS_DONE=$(jq --arg id "$CURRENT_TASK_ID" 'index($id) != null' "$COMPLETED_FILE")
  if [ "$IS_DONE" = "true" ]; then
    echo "⏩ [$CURRENT_TASK_ID] is already marked as completed in $COMPLETED_FILE. Skipping..."
    continue
  fi

  echo ""
  echo "===================================================="
  echo " 🚀 Processing [$CURRENT_TASK_ID]: $CURRENT_TASK_TITLE"
  echo " Scope: $CURRENT_TASK_SCOPE"
  echo "===================================================="

  # 1. Developer Agent
  echo "--> [1/3] Running Developer..."
  hermes chat --yolo -q "$(cat .agents/prompt_dev.md)

  CURRENT ASSIGNMENT:
  Task ID: $CURRENT_TASK_ID
  Title: $CURRENT_TASK_TITLE
  Scope: $CURRENT_TASK_SCOPE"

  # 2. Tester Agent (QA)
  echo "--> [2/3] Running QA Tester..."
  hermes chat --yolo -q "$(cat .agents/prompt_tester.md)

  CURRENT ASSIGNMENT:
  Task ID: $CURRENT_TASK_ID
  Title: $CURRENT_TASK_TITLE
  Scope: $CURRENT_TASK_SCOPE"

  # 3. DevOps Gatekeeper
  echo "--> [3/3] Running DevOps Gatekeeper..."
  hermes chat --yolo -q "$(cat .agents/prompt_devops.md)

  CURRENT ASSIGNMENT:
  Task ID: $CURRENT_TASK_ID
  Title: $CURRENT_TASK_TITLE"

  # 4. Mark Task as Completed
  jq --arg id "$CURRENT_TASK_ID" '. + [$id] | unique' "$COMPLETED_FILE" > "$COMPLETED_FILE.tmp" && mv "$COMPLETED_FILE.tmp" "$COMPLETED_FILE"
  echo "✅ [$CURRENT_TASK_ID] successfully recorded in $COMPLETED_FILE"
done

echo ""
echo "===================================================="
echo " 🎉 All tasks up to date!"
echo "===================================================="
