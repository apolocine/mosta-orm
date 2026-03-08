 curl -s -X PATCH http://localhost:4567/api/setup/upload-jar \
     -H 'Content-Type: application/json' \
     -d '{"action":"start","dialect":"hsqldb","host":"localhost","port":90
   01,"name":"secuaccessdb","user":"SA","password":""}' 2>&1
##01.1Test bridge start via API
