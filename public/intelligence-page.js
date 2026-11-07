/* Decorative consumer of the approved orb renderer; no speech or command authority. */
(function(root){'use strict';let active=null,renderer=null;
function sync(){const node=document.querySelector('.tf-ai-welcome-orbit');if(node===active)return;renderer?.dispose();renderer=null;active=node;if(!node)return;const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');node.prepend(canvas);renderer=root.TradeFlowOrbIdle?.createRenderer?.(canvas,{root,document})||null;}
const observer=new MutationObserver(sync);observer.observe(document.getElementById('app'),{subtree:true,childList:true});sync();root.addEventListener('pagehide',()=>{renderer?.dispose();renderer=null;active=null});root.addEventListener('pageshow',sync);
})(window);
