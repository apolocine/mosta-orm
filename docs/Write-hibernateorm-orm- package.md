● Write(hibernateorm/package.json)
  ⎿  Added 62 lines, removed 35 lines
       1  {
       2 -  "name": "mostaorm",
       2 +  "name": "hibernate-orm",   
       3    "version": "1.0.0",
       4 -  "description": "Hibernate-inspired multi-dialect ORM for Node.js/TypeScript",
       4 +  "description": "Multi-dialect ORM for Node.js/TypeScript — inspired by Hibernate. Supports 13 databases with a single unified API.",
       5    "author": "Dr Hamid MADANI <drmdh@msn.com>",
       6    "license": "MIT",
       7    "type": "module",
       8    "main": "dist/index.js",
       9 -
       9 +  "types": "dist/index.d.ts",
      10 +  "files": [         
      11 +    "dist",          
      12 +    "README.md",     
      13 +    "LICENSE",       
      14 +    "docs"           
      15 +  ],                 
      16 +
      17    "exports": {
      18      ".": {
      19        "types": "./dist/index.d.ts",
      20        "import": "./dist/index.js",
      14 -      "types": "dist/index.d.ts",
      21        "require": "./dist/index.js",
      22        "default": "./dist/index.js"
      23      }
      24    },
      25 +
      26    "scripts": {
      27      "build": "tsc",
      21 -    "dev": "tsc --watch"     
      28 +    "dev": "tsc --watch",    
      29 +    "prepublishOnly": "npm run build"
      30    },
      31 +
      32 +  "keywords": [      
      33 +    "orm",           
      34 +    "database",      
      35 +    "typescript",    
      36 +    "mongodb",       
      37 +    "sqlite",        
      38 +    "postgresql",    
      39 +    "mysql",         
      40 +    "mariadb",       
      41 +    "oracle",        
      42 +    "mssql",         
      43 +    "sql-server",    
      44 +    "multi-dialect", 
      45 +    "repository-pattern",    
      46 +    "hibernate",     
      47 +    "entity",        
      48 +    "schema",        
      49 +    "cockroachdb",   
      50 +    "google-spanner",
      51 +    "sap-hana",      
      52 +    "db2"            
      53 +  ],                 
      54 +
      55 +  "repository": {    
      56 +    "type": "git",   
      57 +    "url": "https://github.com/drmdh/hibernate-orm.git"
      58 +  },                 
      59 +  "bugs": {          
      60 +    "url": "https://github.com/drmdh/hibernate-orm/issues",
      61 +    "email": "drmdh@msn.com" 
      62 +  },                 
      63 +  "homepage": "https://github.com/drmdh/hibernate-orm#readme",
      64 +
      65 +  "engines": {       
      66 +    "node": ">=18.0.0"       
      67 +  },                 
      68 +
      69    "peerDependencies": {
      70      "@google-cloud/spanner": ">=7.0.0",
      71      "@sap/hana-client": ">=2.0.0",
     ...
      79      "pg": ">=8.0.0"
      80    },
      81    "peerDependenciesMeta": {
      36 -    "mongoose": {    
      37 -      "optional": true       
      38 -    },               
      39 -    "better-sqlite3": {      
      40 -      "optional": true       
      41 -    },               
      42 -    "pg": {          
      43 -      "optional": true       
      44 -    },               
      45 -    "mysql2": {      
      46 -      "optional": true       
      47 -    },               
      48 -    "mariadb": {     
      49 -      "optional": true       
      50 -    },               
      51 -    "oracledb": {    
      52 -      "optional": true       
      53 -    },               
      54 -    "mssql": {       
      55 -      "optional": true       
      56 -    },               
      57 -    "ibm_db": {      
      58 -      "optional": true       
      59 -    },               
      60 -    "@sap/hana-client": {    
      61 -      "optional": true       
      62 -    },               
      63 -    "@google-cloud/spanner": {   
      64 -      "optional": true       
      65 -    }                
      82 +    "mongoose":              { "optional": true },     
      83 +    "better-sqlite3":        { "optional": true },     
      84 +    "pg":                    { "optional": true },     
      85 +    "mysql2":                { "optional": true },     
      86 +    "mariadb":               { "optional": true },     
      87 +    "oracledb":              { "optional": true },     
      88 +    "mssql":                 { "optional": true },     
      89 +    "ibm_db":                { "optional": true },     
      90 +    "@sap/hana-client":      { "optional": true },     
      91 +    "@google-cloud/spanner": { "optional": true }      
      92    },
      93 +
      94    "devDependencies": {
      95      "@types/better-sqlite3": "^7.6.0",
      96      "@types/pg": "^8.0.0",

● Maintenant je crée le README.md principal (page npm) et les docs en parallèle :

● Write(hibernateorm/README.md)
  ⎿  Wrote 549 lines to hibernateorm/README.md
      1 # HibernateORM
      2
      3 > **Multi-dialect ORM for Node.js/TypeScript** — inspired by Hibe
        rnate.
      4 > One API. 13 databases. Zero lock-in.
      5
      6 [![npm version](https://img.shields.io/npm/v/hibernate-orm.svg)](
        https://www.npmjs.com/package/hibernate-orm)
      7 [![license](https://img.shields.io/npm/l/hibernate-orm.svg)](LICE
        NSE)
      8 [![node](https://img.shields.io/node/v/hibernate-orm.svg)](https:
        //nodejs.org)
      9 [![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.s
        vg)](https://www.typescriptlang.org)
     … +539 lines (ctrl+o to expand)

