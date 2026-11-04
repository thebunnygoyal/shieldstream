#!/bin/sh
# Rebuilds the three sample clips (not stored in this repo).
# Source: "Big Buck Bunny" (c) 2008 Blender Foundation | www.bigbuckbunny.org, CC-BY 3.0.
# Modified: cut into 90 second clips with stream copy; one thumbnail frame per clip.
set -e
mkdir -p videos && cd videos
curl -L -o bbb.zip https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4.zip
unzip -o bbb.zip
for i in 1 2 3; do
  s=$(( (i-1)*190+20 ))
  ffmpeg -y -ss $s -t 90 -i BigBuckBunny_320x180.mp4 -c copy -movflags +faststart bbb$i.mp4
  ffmpeg -y -ss $((s+30)) -i BigBuckBunny_320x180.mp4 -frames:v 1 -vf scale=480:-1 bbb$i.jpg
done
rm -f bbb.zip BigBuckBunny_320x180.mp4
