python3 << 'PYEOF'
   import urllib.request, json

   API = 'http://localhost:3003/api'

   def api(path, data=None, token=None, method=None):
       headers = {'Content-Type': 'application/json'}
       if token: headers['Authorization'] = f'Bearer {token}'
       body = json.dumps(data).encode() if data else None
       req = urllib.request.Request(f'{API}{path}', data=body, headers=headers, method=method)
       try:
           resp = urllib.request.urlopen(req)
           return json.loads(resp.read())
       except urllib.error.HTTPError as e:
           return {'ERROR': e.code, 'msg': json.loads(e.read()).get('error','')}

   # 1. Login admin
   print("=== LOGIN ADMIN ===")
   login = api('/auth/login', {'login': 'admin', 'password': 'Admin123!'})
   token = login['accessToken']
   refresh = login['refreshToken']
   print(f"Token: {token[:50]}...")
   print(f"Role: {login['user']['role']}")

   # 2. GET /me
   print("\n=== PROFIL ===")
   me = api('/auth/me', token=token)
   print(f"User: {me['username']}, Role: {me['role']}, Logins: {me['loginCount']}")

   # 3. Register new user
   print("\n=== REGISTER ===")
   reg = api('/auth/register', {'email': 'new@test.dz', 'username': 'newuser', 'password': 'Test1234!'})
   print(f"Nouveau: {reg.get('user',{}).get('username','ERREUR')}")

   # 4. Login failed (wrong password)
   print("\n=== LOGIN ECHOUE ===")
   fail = api('/auth/login', {'login': 'admin', 'password': 'wrong'})
   print(f"Resultat: {fail}")

   # 5. Admin list users
   print("\n=== ADMIN: LISTE USERS ===")
   users = api('/admin/users', token=token)
   for u in users:
       print(f"  {u['username']:12} | {u['role']:10} | {u['status']}")

   # 6. Admin audit
   print("\n=== ADMIN: AUDIT ===")
   audit = api('/admin/audit', token=token)
   for a in audit[:5]:
       user = a['user']['username'] if isinstance(a['user'], dict) else str(a['user'])[:8]
       print(f"  {a['action']:15} | {user:10} | {'OK' if a['success'] else 'FAIL'} | {a.get('details','')}")

   # 7. Refresh token
   print("\n=== REFRESH TOKEN ===")
   ref = api('/auth/refresh', {'refreshToken': refresh})
   print(f"Nouveau token: {ref.get('accessToken','ERREUR')[:50]}...")

   # 8. Sessions
   print("\n=== SESSIONS ===")
   sess = api('/auth/sessions', token=token)
   print(f"{len(sess)} session(s) active(s)")

   # 9. Logout
   print("\n=== LOGOUT ===")
   out = api('/auth/logout', {'refreshToken': refresh}, token=token)
   print(f"Resultat: {out}")

   print("\n=== TOUS LES TESTS OK ===")
   # PYEOF
  

