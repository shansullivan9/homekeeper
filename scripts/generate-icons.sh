#!/bin/bash
# Generate PWA icons from the SVG source
# Requires: Inkscape or ImageMagick (convert)
# 
# Option 1: Use an online tool
#   Go to https://realfavicongenerator.net and upload public/icons/icon.svg
#
# Option 2: Use ImageMagick (if installed)
#   convert -background none -resize 192x192 public/icons/icon.svg public/icons/icon-192.png
#   convert -background none -resize 512x512 public/icons/icon.svg public/icons/icon-512.png
#
# Option 3: Use this Node script (requires sharp)
#   npm install sharp --save-dev
#   node -e "
#     const sharp = require('sharp');
#     sharp('public/icons/icon.svg').resize(192).png().toFile('public/icons/icon-192.png');
#     sharp('public/icons/icon.svg').resize(512).png().toFile('public/icons/icon-512.png');
#   "

echo "Please generate icon-192.png and icon-512.png in public/icons/"
echo "Use any of the methods above, or any SVG-to-PNG converter."
