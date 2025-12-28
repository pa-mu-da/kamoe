import sys
path = r'd:\電気椅子ゲーム\src\App.css'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove the persistent result styles
import re
content = re.sub(r'\.chair\.shocked\s*\{[^}]*\}', '', content)
content = re.sub(r'\.chair\.safe\s*\{[^}]*\}', '', content)

# Also ensure we don't have safe colors anywhere
# The user wants "remained shocked chair" to look normal.
# Safe chairs disappear, so their look doesn't matter much but let's keep it consistent.

# Add temporary animation style for shocked if they want a visual feedback during the phase
# But they said "no special effect", so let's try literally no effect on the chair itself.
# The screen flash and banner will tell the result.

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
