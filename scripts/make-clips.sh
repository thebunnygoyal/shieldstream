#!/bin/sh
# Rebuilds the three sample clips (not stored in this repo).
# Source: "Big Buck Bunny" (c) 2008 Blender Foundation | www.bigbuckbunny.org, CC-BY 3.0.
# Modified: cut into 90 second clips with re-encoding to 256x144 H.264 baseline ~100 kbps (so it streams over a slow free tunnel); one thumbnail frame per clip.
set -e
mkdir -p videos && cd videos
curl -L -o bbb.zip https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4.zip
unzip -o bbb.zip
for i in 1 2 3; do
  s=$(( (i-1)*190+20 ))
  ffmpeg -y -ss $s -t 90 -i BigBuckBunny_320x180.mp4 -vf scale=256:144 -c:v libx264 -profile:v baseline -preset veryfast -b:v 100k -maxrate 120k -bufsize 240k -pix_fmt yuv420p -c:a aac -b:a 24k -ac 1 -movflags +faststart bbb$i.mp4
  ffmpeg -y -ss $((s+30)) -i BigBuckBunny_320x180.mp4 -frames:v 1 -vf scale=480:-1 bbb$i.jpg
done
rm -f bbb.zip BigBuckBunny_320x180.mp4
