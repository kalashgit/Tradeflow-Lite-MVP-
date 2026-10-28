/* Flow Wave: four hand-shaped, translucent Bézier surfaces.
   The reference's left trough → central cyan fold → right violet trough is fixed;
   state motion is applied to the surfaces, never synthesized as frequency traces. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TradeFlowFlowWave=api})(typeof globalThis==='object'?globalThis:null,function(){
'use strict';
const surfaces=[
 {id:'upper',paint:'blue',opacity:'.56',path:'M -20 119 C 53 142 112 10 202 10 C 286 10 318 98 396 140 C 485 187 566 90 660 77 L 660 111 C 572 118 510 236 418 232 C 320 228 263 143 190 136 C 101 125 70 188 -20 146 Z'},
 {id:'counter',paint:'indigo',opacity:'.54',path:'M -20 138 C 66 105 101 190 164 184 C 246 177 330 24 411 27 C 494 26 552 127 660 119 L 660 140 C 574 151 529 82 454 90 C 377 98 317 213 241 199 C 158 185 117 132 50 149 C 18 155 -6 159 -20 151 Z'},
 {id:'lower',paint:'deep',opacity:'.52',path:'M -20 146 C 45 140 58 165 128 163 C 202 160 248 101 318 86 C 389 70 438 169 518 164 C 582 160 608 96 660 106 L 660 128 C 596 117 566 212 501 213 C 420 214 383 100 319 99 C 246 98 207 235 128 232 C 58 230 22 184 -20 170 Z'},
 {id:'cyan',paint:'cyan',opacity:'.84',path:'M -20 118 C 50 114 90 136 147 132 C 207 128 245 74 315 69 C 373 66 409 115 476 117 C 541 121 589 88 660 104 L 660 130 C 595 122 559 202 492 181 C 426 162 391 89 321 80 C 257 71 223 191 158 187 C 91 181 57 118 -20 137 Z'}
];
const stops=values=>values.map(([offset,color,opacity])=>'<stop offset="'+offset+'" stop-color="'+color+'" stop-opacity="'+opacity+'"/>').join('');
const gradient=(id,values)=>'<linearGradient id="flow-silk-'+id+'" gradientUnits="userSpaceOnUse" x1="0" y1="100" x2="640" y2="120">'+stops(values)+'</linearGradient>';
function render(){
 const definitions=surfaces.map(s=>'<path id="flow-silk-'+s.id+'-surface" d="'+s.path+'"/>').join('')+
  gradient('blue',[[0,'#026ba7',.12],[.25,'#075bb4',.58],[.43,'#0961b4',.65],[.64,'#0778b6',.49],[.84,'#12619d',.3],[1,'#184078',.12]])+
  gradient('indigo',[[0,'#075884',.12],[.3,'#0857ae',.38],[.58,'#084caa',.69],[.78,'#2062c0',.56],[1,'#6450c2',.48]])+
  gradient('deep',[[0,'#0876b5',.32],[.25,'#075ca9',.55],[.51,'#0873b5',.46],[.75,'#164a89',.4],[1,'#2352a2',.17]])+
  gradient('cyan',[[0,'#109fe9',.55],[.14,'#06b4ed',.76],[.32,'#00d6f2',.96],[.5,'#36eaff',.96],[.67,'#08bdff',.9],[.84,'#5963ff',.86],[1,'#a66cff',.85]])+
  '<linearGradient id="flow-silk-sheen" x1="0" y1="0" x2="0" y2="1">'+stops([[0,'#1d9ee6',.3],[.25,'#0876b2',.06],[.5,'#062842',0],[.8,'#084b8c',.06],[1,'#159bde',.24]])+'</linearGradient>'+
  '<linearGradient id="flow-silk-density" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="238">'+stops([[0,'white',.95],[.34,'white',1],[.5,'white',.68],[.61,'white',.65],[.79,'white',1],[1,'white',.7]])+'</linearGradient>'+
  '<mask id="flow-silk-density-mask" maskUnits="userSpaceOnUse" x="-20" y="0" width="680" height="238"><rect x="-20" width="680" height="238" fill="url(#flow-silk-density)"/></mask>'+
  '<filter id="flow-silk-lighting" x="-10%" y="-20%" width="120%" height="140%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation="3" result="soft-surface"/><feSpecularLighting in="soft-surface" surfaceScale="4" specularConstant=".5" specularExponent="12" lighting-color="#70e6ff" result="silk-light"><feDistantLight azimuth="90" elevation="45"/></feSpecularLighting><feComposite in="silk-light" in2="SourceAlpha" operator="in" result="clipped-light"/><feMorphology in="SourceAlpha" operator="erode" radius=".75" result="interior"/><feComposite in="SourceAlpha" in2="interior" operator="out" result="edge"/><feFlood flood-color="#48b6ef" flood-opacity=".65" result="edge-color"/><feComposite in="edge-color" in2="edge" operator="in" result="lit-edge"/><feGaussianBlur in="lit-edge" stdDeviation=".45" result="soft-edge"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="clipped-light"/><feMergeNode in="soft-edge"/></feMerge></filter>'+
  '<radialGradient id="flow-silk-cyan-light" gradientUnits="userSpaceOnUse" cx="180" cy="175" r="170" gradientTransform="translate(0 105) scale(1 .4)">'+stops([[0,'#a6eaff',.95],[.42,'#6bd9ff',.8],[.78,'#0ac4f2',.14],[1,'#11b7f0',0]])+'</radialGradient>'+
  '<radialGradient id="flow-silk-violet-light" gradientUnits="userSpaceOnUse" cx="540" cy="174" r="118" gradientTransform="translate(0 104.4) scale(1 .4)">'+stops([[0,'#b8a3ff',.82],[.55,'#696bff',.43],[1,'#5a6aff',0]])+'</radialGradient>'+
  '<linearGradient id="flow-silk-edges">'+stops([[0,'white',.8],[.07,'white',1],[.92,'white',1],[1,'white',.85]])+'</linearGradient>'+
  '<mask id="flow-silk-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="640" height="238"><rect width="640" height="238" fill="url(#flow-silk-edges)"/></mask>'+
  '<radialGradient id="flow-silk-halo">'+stops([[0,'#0875a9',.17],[.6,'#075c91',.06],[1,'#08619a',0]])+'</radialGradient>'+
  '<filter id="flow-silk-bloom" x="-15%" y="-35%" width="130%" height="170%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="5"/></filter>';
 const sheets=surfaces.map(s=>'<g class="tf-flow-sheet tf-flow-sheet-'+s.id+'" opacity="'+s.opacity+'">'+
  (s.id==='cyan'?'<use href="#flow-silk-cyan-surface" fill="url(#flow-silk-cyan)" filter="url(#flow-silk-bloom)" opacity=".44"/>':'')+
  '<use href="#flow-silk-'+s.id+'-surface" fill="url(#flow-silk-'+s.paint+')" mask="url(#flow-silk-density-mask)" filter="url(#flow-silk-lighting)"/>'+
  (s.id!=='cyan'?'<use href="#flow-silk-'+s.id+'-surface" fill="url(#flow-silk-sheen)"/>':'')+
  (s.id==='cyan'?'<use href="#flow-silk-cyan-surface" fill="url(#flow-silk-cyan-light)"/><use href="#flow-silk-cyan-surface" fill="url(#flow-silk-violet-light)"/>':'')+
  '</g>').join('');
 return '<svg class="tf-flow-art" viewBox="0 0 640 238" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"><defs>'+definitions+'</defs><ellipse cx="320" cy="124" rx="294" ry="106" fill="url(#flow-silk-halo)"/><g class="tf-flow-ribbon-group" mask="url(#flow-silk-mask)">'+sheets+'</g></svg>';
}
return Object.freeze({render});
});
