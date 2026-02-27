#!/bin/bash

# bump-version.sh - Versionsnummer hochzählen und Cache invalidieren
# Verwendung: ./bump-version.sh        (patch version, z.B. 1.0.0 -> 1.0.1)
#            ./bump-version.sh minor   (minor version, z.B. 1.0.0 -> 1.1.0)
#            ./bump-version.sh major   (major version, z.B. 1.0.0 -> 2.0.0)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION_FILE="$SCRIPT_DIR/.version"
JS_VERSION="$SCRIPT_DIR/js/core/version.js"
SW_FILE="$SCRIPT_DIR/sw.js"

# Aktuelle Version lesen
if [ ! -f "$VERSION_FILE" ]; then
  echo "❌ .version Datei nicht gefunden!"
  exit 1
fi

CURRENT_VERSION=$(cat "$VERSION_FILE")
echo "📌 Aktuelle Version: $CURRENT_VERSION"

# Versionsnummer hochzählen
BUMP_TYPE="${1:-patch}"

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

case "$BUMP_TYPE" in
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  patch|*)
    PATCH=$((PATCH + 1))
    ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
echo "✨ Neue Version: $NEW_VERSION"

# Dateien aktualisieren
echo "$NEW_VERSION" > "$VERSION_FILE"

cat > "$JS_VERSION" << EOF
export const APP_VERSION = "$NEW_VERSION";
EOF

# sw.js aktualisieren
sed -i "s/const APP_VERSION = \".*\";/const APP_VERSION = \"$NEW_VERSION\";/" "$SW_FILE"

echo "✅ Version erfolgreich hochgezählt!"
echo "   - .version: $NEW_VERSION"
echo "   - js/core/version.js: export const APP_VERSION = \"$NEW_VERSION\";"
echo "   - sw.js: const APP_VERSION = \"$NEW_VERSION\";"
echo ""
echo "🚀 Service Worker Cache wird beim nächsten Reload invalidiert!"

git add *
git commit -m "Bump version to $NEW_VERSION"