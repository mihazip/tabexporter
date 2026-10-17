#!/bin/bash
set -euo pipefail

# TabExporter addon upgrade script
# Bumps version, creates zip, and optionally signs/submits to AMO

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="$SCRIPT_DIR/manifest.json"
ADDON_NAME="tabexporter"

# Repo files that are not part of the packaged addon. web-ext otherwise
# lints and ships everything under --source-dir.
IGNORE_FILES=(--ignore-files upgrade.sh README.md RELEASING.md .gitignore)

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

usage() {
    echo "Usage: $0 [patch|minor|major|VERSION] [--sign] [--lint] [--run]"
    echo ""
    echo "  patch         Bump patch version (default): 0.1.0 -> 0.1.1"
    echo "  minor         Bump minor version: 0.1.0 -> 0.2.0"
    echo "  major         Bump major version: 0.1.0 -> 1.0.0"
    echo "  X.Y.Z         Set explicit version"
    echo ""
    echo "Options:"
    echo "  --lint        Run web-ext lint before packaging"
    echo "  --run         Launch Firefox with the addon loaded for testing"
    echo "  --sign        Sign and submit to AMO (requires API keys)"
    echo "                Set AMO_JWT_ISSUER and AMO_JWT_SECRET env vars"
    echo ""
    echo "Examples:"
    echo "  $0              # Bump patch, create zip"
    echo "  $0 minor        # Bump minor, create zip"
    echo "  $0 --lint       # Bump patch, lint, create zip"
    echo "  $0 0.2.0 --sign # Set version to 0.2.0, create zip, submit to AMO"
    exit 1
}

# Parse current version from manifest
get_version() {
    grep '"version"' "$MANIFEST" | sed 's/.*"\([0-9][0-9.]*\)".*/\1/'
}

# Bump version
bump_version() {
    local current="$1"
    local bump_type="$2"

    IFS='.' read -r major minor patch <<< "$current"

    case "$bump_type" in
        major) echo "$((major + 1)).0.0" ;;
        minor) echo "$major.$((minor + 1)).0" ;;
        patch) echo "$major.$minor.$((patch + 1))" ;;
        *) echo "$bump_type" ;;  # Explicit version
    esac
}

# Update manifest version
set_version() {
    local new_version="$1"
    sed -i.bak "s/\"version\": \"[0-9][0-9.]*\"/\"version\": \"$new_version\"/" "$MANIFEST"
    rm -f "$MANIFEST.bak"
}

# Main
BUMP_TYPE="patch"
DO_LINT=false
DO_RUN=false
DO_SIGN=false

for arg in "$@"; do
    case "$arg" in
        --lint) DO_LINT=true ;;
        --run) DO_RUN=true ;;
        --sign) DO_SIGN=true ;;
        --help|-h) usage ;;
        patch|minor|major) BUMP_TYPE="$arg" ;;
        [0-9]*) BUMP_TYPE="$arg" ;;
        *) echo -e "${RED}Unknown argument: $arg${NC}"; usage ;;
    esac
done

OLD_VERSION=$(get_version)
NEW_VERSION=$(bump_version "$OLD_VERSION" "$BUMP_TYPE")

echo -e "${BLUE}=== TabExporter Upgrade ===${NC}"
echo -e "Version: ${YELLOW}$OLD_VERSION${NC} -> ${GREEN}$NEW_VERSION${NC}"
echo ""

# Update version in manifest
set_version "$NEW_VERSION"
echo -e "${GREEN}✓${NC} Updated manifest.json version to $NEW_VERSION"

# Lint with web-ext
if $DO_LINT; then
    echo -e "\n${BLUE}Running web-ext lint...${NC}"
    npx web-ext lint --source-dir "$SCRIPT_DIR" "${IGNORE_FILES[@]}" --self-hosted --warnings-as-errors || {
        echo -e "${RED}Lint failed! Fix issues before packaging.${NC}"
        # Revert version on failure
        set_version "$OLD_VERSION"
        exit 1
    }
    echo -e "${GREEN}✓${NC} Lint passed"
fi

# Create zip. web-ext does the packaging rather than the zip binary, which
# Git Bash on Windows does not ship; the ignore list decides the contents.
ZIP_FILE="$SCRIPT_DIR/dist/${ADDON_NAME}-${NEW_VERSION}.zip"
mkdir -p "$SCRIPT_DIR/dist"
rm -f "$ZIP_FILE"

cd "$SCRIPT_DIR"
npx web-ext build \
    --source-dir "$SCRIPT_DIR" \
    "${IGNORE_FILES[@]}" \
    --artifacts-dir "$SCRIPT_DIR/dist" \
    --overwrite-dest

ZIP_ABS="$(cd "$(dirname "$ZIP_FILE")" && pwd)/$(basename "$ZIP_FILE")"
echo -e "${GREEN}✓${NC} Created $ZIP_ABS"

# Show zip contents. Reads the archive with Node so no unzip binary is needed.
echo -e "\n${BLUE}Zip contents:${NC}"
node -e '
const fs = require("fs");
const buf = fs.readFileSync(process.argv[1]);
// Walk the zip central directory and print each entry name.
for (let i = 0; i < buf.length - 3; i++) {
  if (buf.readUInt32LE(i) !== 0x02014b50) continue;
  const len = buf.readUInt16LE(i + 28);
  console.log(buf.toString("utf8", i + 46, i + 46 + len));
}
' "$ZIP_FILE"

# Sign and submit to AMO
if $DO_SIGN; then
    if [[ -z "${AMO_JWT_ISSUER:-}" || -z "${AMO_JWT_SECRET:-}" ]]; then
        echo -e "\n${RED}Error: AMO_JWT_ISSUER and AMO_JWT_SECRET must be set${NC}"
        echo "Get your API keys at: https://addons.mozilla.org/en-US/developers/addon/api/key/"
        exit 1
    fi
    echo -e "\n${BLUE}Submitting to AMO for signing...${NC}"
    npx web-ext sign \
        --source-dir "$SCRIPT_DIR" \
        "${IGNORE_FILES[@]}" \
        --api-key "$AMO_JWT_ISSUER" \
        --api-secret "$AMO_JWT_SECRET" \
        --channel unlisted
    echo -e "${GREEN}✓${NC} Submitted to AMO"
fi

# Run in Firefox for testing
if $DO_RUN; then
    echo -e "\n${BLUE}Launching Firefox with addon loaded...${NC}"
    npx web-ext run --source-dir "$SCRIPT_DIR" "${IGNORE_FILES[@]}" --browser-console
fi

echo -e "\n${GREEN}=== Done! ===${NC}"
echo -e "Version ${GREEN}$NEW_VERSION${NC} is ready."
echo ""
echo -e "To install manually in Firefox:"
echo -e "  1. Open ${YELLOW}about:debugging#/runtime/this-firefox${NC}"
echo -e "  2. Click 'Load Temporary Add-on...'"
echo -e "  3. Select ${YELLOW}$ZIP_ABS${NC}"
echo ""
echo -e "Or use: ${YELLOW}$0 --run${NC} to auto-load in Firefox"