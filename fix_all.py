import sys

# 1. Update App.jsx: Move the button inside the circle-layout div
path_jsx = r'd:\電気椅子ゲーム\src\App.jsx'
with open(path_jsx, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove the old center-action-area block
import re
pattern = re.compile(r'\{/\* Center Standing Button \*/\}.*?\{gameState\.currentPhase === \'FINALIZED\' && isMyTurnAsSeating && \(.*?\)\}', re.DOTALL)
content = pattern.sub('', content)

# Insert the button inside circle-layout
insertion_point = '<div className="game-board circle-layout" onContextMenu={(e) => e.preventDefault()}>'
replacement = insertion_point + """
            {gameState.currentPhase === 'FINALIZED' && isMyTurnAsSeating && (
              <button onClick={handleStandUp} className="heavy-btn stand-up-btn-center fade-in">
                椅子を立つ
              </button>
            )}"""

content = content.replace(insertion_point, replacement)

with open(path_jsx, 'w', encoding='utf-8') as f:
    f.write(content)

# 2. Update App.css: Fix centering logic
path_css = r'd:\電気椅子ゲーム\src\App.css'
with open(path_css, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
for line in lines:
    if '.center-action-area' in line or '.stand-up-btn-center' in line:
        skip = True
        continue
    if skip and ('}' in line):
        skip = False
        continue
    if not skip:
        new_lines.append(line)

final_css = """
.stand-up-btn-center {
  position: absolute;
  top: 0;
  left: 0;
  transform: translate(-50%, -50%) !important;
  z-index: 100;
  white-space: nowrap;
  background: linear-gradient(135deg, #004488, #0088ff) !important;
  box-shadow: 0 0 40px rgba(0, 136, 255, 0.4) !important;
  border-color: #3e8fff !important;
  border-width: 4px !important;
  font-size: 1.8rem !important;
  padding: 1.2rem 2.4rem !important;
  font-weight: 900 !important;
  letter-spacing: 3px !important;
  animation: pulse-blue 2s infinite !important;
  pointer-events: auto;
}

.stand-up-btn-center:hover {
  transform: translate(-50%, -50%) scale(1.1) rotate(-2deg) !important;
  box-shadow: 0 0 70px rgba(0, 136, 255, 0.7) !important;
}
"""

with open(path_css, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
    f.write(final_css)
