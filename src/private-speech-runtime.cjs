'use strict';
const {execFile}=require('node:child_process');
// Fixed Python program; package/version arguments originate only in trusted adapters.
function checkRuntime(python,expected){return new Promise((resolve,reject)=>{
 execFile(python,['-c','import importlib.metadata as m,json,sys; e=json.loads(sys.argv[1]); sys.exit(0 if all(m.version(k)==v for k,v in e.items()) else 1)',JSON.stringify(expected)],{timeout:5000,maxBuffer:1000},error=>error?reject(Error('Pinned speech runtime missing')):resolve());
})}
module.exports={checkRuntime};
