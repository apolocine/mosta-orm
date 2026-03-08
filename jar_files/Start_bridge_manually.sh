#    Start bridge manually and test
java -cp hsqldb-2.7.2.jar                                       
   org.hsqldb.util.DatabaseManagerSwing --url                                
   "jdbc:hsqldb:hsql://localhost:9001/secuaccessdb" --user SA --password     
   "" --noexit --silent 2>&1 &                                               
   sleep 2 && echo "check" ; java --source 11 -cp
   hsqldb-2.7.2.jar /home/hmd/dev/MostaGare-Install/mostajs/mosta-orm/bridge/MostaJdbcBridge.java --jdbc-url "jdbc:hsqldb:hsql://localhost:9001/secuaccessdb" --user SA --password "" --port 8765 2>&1 & sleep 3 && curl -s http://localhost:8765/health 2>&1

java --source 11 -cp jar_files/hsqldb-2.7.2.jar /home/hmd/dev/MostaGar
      e-Install/mostajs/mosta-orm/bridge/MostaJdbcBridge.java --jdbc-url
      "jdbc:hsqldb:hsql://loc…)                                              
  ⎿  [MostaJdbcBridge] Connecting to: jdbc:hsqldb:hsql://localhost:9001/  
     [MostaJdbcBridge] JDBC connected OK                                     
     [MostaJdbcBridge] HTTP bridge listening on port 8765 
     
     
     

## Test bridge with empty db alias
java --source 11 -cp jar_files/hsqldb-2.7.2.jar /home/hmd/dev/MostaGare
   -Install/mostajs/mosta-orm/bridge/MostaJdbcBridge.java --jdbc-url
   "jdbc:hsqldb:hsql://localhost:9001/" --user SA --password "" --port
   8765 2>&1 &
   sleep 4 && curl -s http://localhost:8765/health 2>&1
   
##    Kill bridge and old HSQLDB server   
     # D'abord tuer le bridge et le serveur                                    
   fuser -k 8765/tcp 2>/dev/null; kill 59757 2>/dev/null; sleep 1 && echo
   "Killed"

