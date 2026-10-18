'use strict';
// TradeFlow Desktop: serves packaged local assets on a stable loopback origin.
// The stable origin is necessary to preserve IndexedDB records across launches.
const {app,BrowserWindow,shell,dialog}=require('electron');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const PORT=39221,HOST='127.0.0.1',assetRoot=path.resolve(__dirname,'public');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.ico':'image/x-icon'};
let server=null,window=null;
if(!app.requestSingleInstanceLock()){app.quit()}
else{
 app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.focus()}});
 app.whenReady().then(async()=>{
  try{
   await new Promise((resolve,reject)=>{
    server=http.createServer((req,res)=>{
     if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return}
     let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://'+HOST).pathname)}catch{res.writeHead(400);res.end();return}
     const target=path.resolve(assetRoot,'.'+(pathname==='/'?'/index.html':pathname));
     if(target!==assetRoot&&!target.startsWith(assetRoot+path.sep)){res.writeHead(403);res.end();return}
     fs.stat(target,(err,stat)=>{
      if(err||!stat.isFile()){res.writeHead(404);res.end();return}
      res.writeHead(200,{'Content-Type':mime[path.extname(target).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      if(req.method==='HEAD'){res.end();return}
      fs.createReadStream(target).on('error',()=>res.destroy()).pipe(res);
     });
    });
    server.once('error',reject);
    server.listen(PORT,HOST,resolve);
   });
   window=new BrowserWindow({width:1280,height:850,minWidth:375,minHeight:560,backgroundColor:'#10151f',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
   window.webContents.setWindowOpenHandler(({url})=>{if(url.startsWith('https://'))void shell.openExternal(url);return {action:'deny'}});
   window.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('http://'+HOST+':'+PORT+'/')){event.preventDefault();if(url.startsWith('https://'))void shell.openExternal(url)}});
   await window.loadURL('http://'+HOST+':'+PORT+'/');
  }catch(error){
   dialog.showErrorBox('TradeFlow could not start','Unable to start local TradeFlow app. Another application may be using port '+PORT+'.\n'+String(error.message||error));
   app.quit();
  }
 });
 app.on('window-all-closed',()=>app.quit());
 app.on('before-quit',()=>{if(server)server.close()});
}
