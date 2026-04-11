##    Drop all Oracle tables for clean recreation
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
     console.log(tables.length + ' tables a dropper');
     for (const t of tables) {
       await conn.execute('DROP TABLE \"' + t + '\" CASCADE CONSTRAINTS');
       console.log('  Dropped:', t);
     }
     await conn.close();
     console.log('Done — relancez /setup pour recreer avec les bons types');
   })();
   " 2>&1


