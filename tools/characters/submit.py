import base64, json, os, sys, urllib.request
def du(f): return 'data:image/png;base64,'+base64.b64encode(open(f,'rb').read()).decode()
def post(path, body):
    r=urllib.request.Request('https://api.meshy.ai'+path, data=json.dumps(body).encode(),
      headers={'Authorization':'Bearer '+os.environ['MESHY_API_KEY'],'Content-Type':'application/json'})
    try: return json.load(urllib.request.urlopen(r))
    except urllib.error.HTTPError as e: return {'error':e.code,'body':e.read().decode()}
common=dict(ai_model='latest', should_remesh=True, topology='triangle', target_polycount=20000,
  pose_mode='a-pose', should_texture=True, texture_resolution='2k', target_formats=['glb'], multi_view_thumbnails=True)
name=sys.argv[1]
files={'aelar':['a_front.png','a_back.png','a_34.png'],'ryn':['r_front.png','r_side.png','r_back.png']}[name]
print(name, post('/openapi/v1/multi-image-to-3d', dict(image_urls=[du(f) for f in files], **common)))
