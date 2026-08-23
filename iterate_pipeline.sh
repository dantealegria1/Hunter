#!/usr/bin/env bash
set -e

if ! command -v jq &> /dev/null; then
    echo "Error: 'jq' is required."
    exit 1
fi

TASKS_FILE=".agents/tasks.json"

if [ ! -f "$TASKS_FILE" ]; then
    echo "Error: $TASKS_FILE does not exist."
    exit 1
fi

TOTAL_TASKS=$(jq '. | length' "$TASKS_FILE")
echo "Found $TOTAL_TASKS tasks in $TASKS_FILE."

for ((i=0; i<$TOTAL_TASKS; i++)); do
  CURRENT_TASK_ID=$(jq -r ".[$i].id" "$TASKS_FILE")
  CURRENT_TASK_TITLE=$(jq -r ".[$i].title" "$TASKS_FILE")
  CURRENT_TASK_SCOPE=$(jq -r ".[$i].scope" "$TASKS_FILE")

  echo ""
  echo "===================================================="
  echo " 🚀 Processing [$CURRENT_TASK_ID]: $CURRENT_TASK_TITLE"
  echo "===================================================="

  # 1. Developer Agent
  echo "--> [1/4] Running Developer..."
  hermes chat --yolo -q "$(cat .agents/prompt_dev.md)

  CURRENT ASSIGNMENT:
  Task ID: $CURRENT_TASK_ID
  Title: $CURRENT_TASK_TITLE
  Scope: $CURRENT_TASK_SCOPE"

  # 2. Designer Agent (Aesthetics & Dark Mode)
  echo "--> [2/4] Running Designer..."
  hermes chat --yolo -q "$(cat .agents/prompt_designer.md)

  CURRENT ASSIGNMENT:
  Task ID: $CURRENT_TASK_ID
  Title: $CURRENT_TASK_TITLE
  Scope: $CURRENT_TASK_SCOPE"

  # 3. Tester Agent (QA)
  echo "--> [3/4] Running QA Tester..."
  hermes chat --yolo -q "$(cat .agents/prompt_tester.md)

  CURRENT ASSIGNMENT:
  Task ID: $CURRENT_TASK_ID
  Title: $CURRENT_TASK_TITLE
  Scope: $CURRENT_TASK_SCOPE"

  # 4. DevOps Gatekeeper
  echo "--> [4/4] Running DevOps Gatekeeper..."
  hermes chat --yolo -q "$(cat .agents/prompt_devops.md)

  CURRENT ASSIGNMENT:
  Task ID: $CURRENT_TASK_ID
  Title: $CURRENT_TASK_TITLE"
done

echo ""
echo "===================================================="
echo " 🎉 Full UI polish, tests, and commits completed!"
echo "===================================================="
