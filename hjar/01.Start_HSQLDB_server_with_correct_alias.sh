##  Start HSQLDB server with correct alias

java -cp hsqldb-2.7.2.jar org.hsqldb.server.Server  \              
   --database.0 file:./data/secuaccessdb --dbname.0 secuaccessdb 2>&1 & \       
   sleep 2 && fuser 9001/tcp 2>/dev/null && echo "HSQLDB server started        
   with alias secuaccessdb"
