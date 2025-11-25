#!/bin/bash
# Extract the built executable from the Docker/Podman image

set -e

IMAGE_NAME="drei:latest"
BINARY_PATH="/app/src-tauri/target/release/drei"
OUTPUT_DIR="./build"
OUTPUT_FILE="$OUTPUT_DIR/drei"

usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Extract the built DREI executable from the container image.

Optional arguments:
  --image NAME         Image name to extract from (default: drei:latest)
  --output PATH        Output path for extracted binary (default: ./build/drei)
  --build              Build the image before extracting
  -h, --help           Show this help message

Examples:
  $0
  $0 --build
  $0 --output /usr/local/bin/drei
  $0 --image drei:v1.0 --output ./drei-binary

EOF
    exit 1
}

BUILD=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --image)
            IMAGE_NAME="$2"
            shift 2
            ;;
        --output)
            OUTPUT_FILE="$2"
            OUTPUT_DIR=$(dirname "$OUTPUT_FILE")
            shift 2
            ;;
        --build)
            BUILD=true
            shift
            ;;
        -h|--help)
            usage
	    exit 0
            ;;
        *)
            echo "Unknown option: $1"
            usage
	    exit 1
            ;;
    esac
done

if [ "$BUILD" = true ]; then
    echo "Building image $IMAGE_NAME..."
    podman build -t "$IMAGE_NAME" .
fi

if ! podman image exists "$IMAGE_NAME"; then
    echo "Error: Image '$IMAGE_NAME' not found."
    echo "Run with --build to create it, or build manually with: podman build -t $IMAGE_NAME ."
    exit 1
fi

mkdir -p "$OUTPUT_DIR"
echo "Extracting binary from image $IMAGE_NAME..."

CONTAINER_ID=$(podman create "$IMAGE_NAME")

trap "podman rm $CONTAINER_ID > /dev/null 2>&1" EXIT
podman cp "$CONTAINER_ID:$BINARY_PATH" "$OUTPUT_FILE"
podman rm "$CONTAINER_ID" > /dev/null 2>&1 || true
chmod +x "$OUTPUT_FILE"
echo "Successfully extracted binary to: $OUTPUT_FILE"
echo ""
echo "Checking for required dependencies..."

HAS_WEBKIT=false

if command -v pkg-config >/dev/null 2>&1; then
    if pkg-config --exists webkit2gtk-4.1; then
        WEBKIT_VERSION=$(pkg-config --modversion webkit2gtk-4.1)
        echo "✓ webkit2gtk-4.1 is installed (version $WEBKIT_VERSION)"
        HAS_WEBKIT=true
    elif pkg-config --exists webkit2gtk-4.0; then
        WEBKIT_VERSION=$(pkg-config --modversion webkit2gtk-4.0)
        echo "✓ webkit2gtk-4.0 is installed (version $WEBKIT_VERSION)"
        HAS_WEBKIT=true
    fi
fi
if [ "$HAS_WEBKIT" = false ]; then
    if ldconfig -p 2>/dev/null | grep -q "libwebkit2gtk-4.1"; then
        echo "✓ webkit2gtk-4.1 library found"
        HAS_WEBKIT=true
    elif ldconfig -p 2>/dev/null | grep -q "libwebkit2gtk-4.0"; then
        echo "✓ webkit2gtk-4.0 library found"
        HAS_WEBKIT=true
    fi
fi
if [ "$HAS_WEBKIT" = false ]; then
    echo "✗ webkit2gtk is NOT installed"
    echo ""
    echo "The extracted binary requires webkit2gtk to run."
    echo "Install it with:"
    echo ""
    echo "  Debian/Ubuntu:"
    echo "    sudo apt-get install libwebkit2gtk-4.1-0"
    echo ""
    echo "  Fedora:"
    echo "    sudo dnf install webkit2gtk4.1"
    echo ""
    echo "  Arch:"
    echo "    sudo pacman -S webkit2gtk-4.1"
    echo ""
else
    echo ""
    echo "You can now run the binary directly:"
    echo "  $OUTPUT_FILE --selector .contents --url https://example.com"
fi