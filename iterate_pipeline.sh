cat << 'EOF' > iterate_pipeline.sh
#!/usr/bin/env bash
set -e

if ! command -v jq &> /dev/null; then
    echo "Error: 'jq' es requerido. Instálalo con sudo apt install jq"
    exit 1
fi

TASKS_FILE=".agents/tasks.json"

if [ ! -f "$TASKS_FILE" ]; then
    echo "Error: $TASKS_FILE no existe."
    exit 1
fi

TOTAL_TASKS=$(jq '. | length' "$TASKS_FILE")
echo "Se detectaron $TOTAL_TASKS tareas en $TASKS_FILE."

# Bucle iterativo de tareas
for ((i=0; i<$TOTAL_TASKS; i++)); do
  CURRENT_TASK_ID=$(jq -r ".[$i].id" "$TASKS_FILE")
  CURRENT_TASK_TITLE=$(jq -r ".[$i].title" "$TASKS_FILE")
  CURRENT_TASK_SCOPE=$(jq -r ".[$i].scope" "$TASKS_FILE")

  # Omitir TASK-01 porque ya fue completada y verificada
  if [ "$CURRENT_TASK_ID" == "TASK-01" ]; then
    echo "⏩ TASK-01 ya está completada. Saltando a la siguiente..."
    continue
  fi

  echo ""
  echo "===================================================="
  echo " 🚀 Procesando [$CURRENT_TASK_ID]: $CURRENT_TASK_TITLE"
  echo " Scope: $CURRENT_TASK_SCOPE"
  echo "===================================================="

  # 1. Developer Agent
  echo "--> [1/3] Ejecutando Developer..."
  hermes chat --yolo -q "$(cat .agents/prompt_dev.md)

  CURRENT ASSIGNMENT:
  Task ID: $CURRENT_TASK_ID
  Title: $CURRENT_TASK_TITLE
  Scope: $CURRENT_TASK_SCOPE"

  # 2. Tester Agent (QA)
  echo "--> [2/3] Ejecutando Tester (QA)..."
  hermes chat --yolo -q "$(cat .agents/prompt_tester.md)

  CURRENT ASSIGNMENT:
  Task ID: $CURRENT_TASK_ID
  Title: $CURRENT_TASK_TITLE
  Scope: $CURRENT_TASK_SCOPE"

  # 3. DevOps Gatekeeper
  echo "--> [3/3] Ejecutando DevOps Gatekeeper..."
  hermes chat --yolo -q "$(cat .agents/prompt_devops.md)

  CURRENT ASSIGNMENT:
  Task ID: $CURRENT_TASK_ID
  Title: $CURRENT_TASK_TITLE"
done

echo ""
echo "===================================================="
echo " 🎉 Proyecto completado y subido a Hunter.git"
echo "===================================================="
EOF

chmod +x iterate_pipeline.sh
