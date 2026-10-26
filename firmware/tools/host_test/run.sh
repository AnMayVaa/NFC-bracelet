#!/bin/sh
# Runs the station and admin sketches on a PC against fake hardware and a scripted server,
# to check the tap / beep / queue / SOS logic. Needs g++. Does not replace a real ESP32 build.
set -e
cd "$(dirname "$0")"
FW=../..
OUT=$(mktemp -d)
for st in food place activity; do
  g++ -std=gnu++17 -w -Istubs -I$FW/$st -DSKETCH="\"$st.ino\"" -DSTATION_TEST="\"$st\"" -x c++ station_test.cpp -o $OUT/$st
  $OUT/$st
done
g++ -std=gnu++17 -w -Istubs -I$FW/stamp -DSKETCH='"stamp.ino"' -DSTATION_TEST='"food"' -x c++ station_test.cpp -o $OUT/stamp
$OUT/stamp
g++ -std=gnu++17 -w -Istubs -I$FW/admin -x c++ admin_test.cpp -o $OUT/admin
$OUT/admin
rm -rf $OUT
