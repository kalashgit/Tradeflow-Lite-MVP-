/* Microphone PCM transport only. No speech interpretation, persistence or network. */
class TradeFlowPcmCapture extends AudioWorkletProcessor{
 constructor(){super();this.frames=new Float32Array(2048);this.offset=0}
 process(inputs){
  const input=inputs[0]?.[0];if(!input)return true;
  for(let start=0;start<input.length;){const n=Math.min(input.length-start,this.frames.length-this.offset);this.frames.set(input.subarray(start,start+n),this.offset);start+=n;this.offset+=n;if(this.offset===this.frames.length){this.port.postMessage(this.frames,[this.frames.buffer]);this.frames=new Float32Array(2048);this.offset=0}}
  return true;
 }
}
registerProcessor('tradeflow-pcm-capture',TradeFlowPcmCapture);
