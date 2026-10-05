/**
 * Runs inline in <head> before any app or library code (app/layout.tsx), so older iOS Safari gets:
 *  • small polyfills for methods our dependencies call at runtime (Array/String .at, findLast,
 *    findLastIndex, Object.hasOwn, crypto.randomUUID);
 *  • a one-time reload when a JS chunk from an older deploy fails to load (ChunkLoadError),
 *    instead of a dead page. Same rule as lib/chunk-error.ts (30 s guard in sessionStorage).
 * Plain ES5, no syntax older Safari can't parse.
 */
export const compatScript = `(function(){
function def(o,k,f){if(o&&!o[k])try{Object.defineProperty(o,k,{value:f,writable:true,configurable:true});}catch(e){}}
function at(n){n=Math.trunc(n)||0;if(n<0)n+=this.length;if(n<0||n>=this.length)return undefined;return this[n];}
def(Array.prototype,"at",at);def(String.prototype,"at",at);
def(Array.prototype,"findLast",function(f,t){for(var i=this.length-1;i>=0;i--)if(f.call(t,this[i],i,this))return this[i];});
def(Array.prototype,"findLastIndex",function(f,t){for(var i=this.length-1;i>=0;i--)if(f.call(t,this[i],i,this))return i;return -1;});
def(Object,"hasOwn",function(o,k){return Object.prototype.hasOwnProperty.call(o,k);});
var c=window.crypto;
if(c&&c.getRandomValues)def(c,"randomUUID",function(){var b=new Uint8Array(16);c.getRandomValues(b);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;var h="";for(var i=0;i<16;i++)h+=(b[i]+256).toString(16).slice(1);return h.slice(0,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16)+"-"+h.slice(16,20)+"-"+h.slice(20);});
var re=/ChunkLoadError|Loading (CSS )?chunk [\\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;
function reload(){try{var last=+(sessionStorage.getItem("settld-chunk-reload")||0);if(Date.now()-last<30000)return;sessionStorage.setItem("settld-chunk-reload",String(Date.now()));}catch(e){if(window.__settldReloaded)return;window.__settldReloaded=true;}location.reload();}
function check(x){var t=x?((x.name||"")+" "+(x.message||String(x))):"";if(re.test(t))reload();}
window.addEventListener("error",function(e){check(e.error||{message:e.message});var s=e.target;if(s&&s.tagName==="SCRIPT"&&/\\/_next\\/static\\//.test(s.src||""))reload();},true);
window.addEventListener("unhandledrejection",function(e){check(e.reason);});
})();`;
