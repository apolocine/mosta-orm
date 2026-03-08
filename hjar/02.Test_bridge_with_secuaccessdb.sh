## Test bridge with secuaccessdb alias
java --source 11 -cp hsqldb-2.7.2.jar /home/hmd/dev/MostaGare   
   -Install/mostajs/mosta-orm/bridge/MostaJdbcBridge.java --jdbc-url         
   "jdbc:hsqldb:hsql://localhost:9001/secuaccessdb" --user SA --password     
   "" --port 8765 2>&1 &
   sleep 4 && curl -s http://localhost:8765/health 2>&1
   
