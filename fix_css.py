import sys
path = r'd:\電気椅子ゲーム\src\App.css'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
for line in lines:
    if '.center-action-area' in line:
        skip = True
        continue
    if skip and ('}' in line):
        skip = False
        continue
    if '.stand-up-btn-center' in line:
        skip = True
        continue
    if skip and ('}' in line):
        skip = False
        continue
    if '.game-board-container' in line:
        skip = True
        continue
    if skip and ('}' in line):
        skip = False
        continue
    if not skip:
        new_lines.append(line)

final_css = """
.game-board-container {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 4rem;
  margin: 2rem 0;
  min-height: 700px;
  position: relative; /* Base for centering */
}

.center-action-area {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 100;
  pointer-events: none;
}

.stand-up-btn-center {
  pointer-events: auto;
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
}

.stand-up-btn-center:hover {
  transform: scale(1.1) rotate(-2deg) !important;
  box-shadow: 0 0 70px rgba(0, 136, 255, 0.7) !important;
}
"""

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
    f.write(final_css)
