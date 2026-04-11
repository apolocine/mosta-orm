DEST=/home/hmd/dev/MostaGare-Install/SecuAccessPro/ornet_server_test/node_mod
   ules/@mostajs
   rm -rf "$DEST/mproject" "$DEST/orm"
   cp -r /home/hmd/dev/MostaGare-Install/mostajs/mosta-mproject "$DEST/mproject"
   cp -r /home/hmd/dev/MostaGare-Install/mostajs/mosta-orm "$DEST/orm"
   cp /home/hmd/dev/MostaGare-Install/mostajs/mosta-net/dist/server.js
   "$DEST/net/dist/server.js"
   echo "DONE" && ls "$DEST/"

