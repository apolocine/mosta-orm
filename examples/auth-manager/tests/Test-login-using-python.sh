python3 -c "                                                                                                                                        
   import urllib.request, json                         
   data = json.dumps({'login': 'admin', 'password': 'Admin123!'}).encode()
   req = urllib.request.Request('http://localhost:3003/api/auth/login', data=data, headers={'Content-Type': 'application/json'})
   resp = urllib.request.urlopen(req)
   print(json.dumps(json.loads(resp.read()), indent=2))
   "
   

