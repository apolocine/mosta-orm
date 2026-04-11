 #    Drop Oracle tables to recreate with CLOB columns
 npx tsx -e "                                                               
   const oracledb = require('oracledb');
   oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
   oracledb.autoCommit = true;
   (async () => {
     const conn = await oracledb.getConnection({ user: 'devuser', password:
   'devpass26', connectString: 'localhost:1521/XEPDB1' });
     const r = await conn.execute('SELECT table_name FROM user_tables ORDER
   BY table_name');
     const tables = r.rows.map(r => r.TABLE_NAME);
     console.log('Tables actuelles:', tables);
     for (const t of tables) {
       try {
         await conn.execute('DROP TABLE \"' + t + '\" CASCADE CONSTRAINTS');
         console.log('  Dropped:', t);
       } catch(e) { console.log('  Skip:', t, e.message); }
     }
     await conn.close();
     console.log('Done — tables droppées, relancez le serveur pour les
   recréer avec CLOB');
   })();
   " 2>&1


