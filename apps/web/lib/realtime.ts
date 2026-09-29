export type Session={playerId:string;displayName:string;sessionToken:string;expiresAt:string};
export type Room={id:string;code:string;playerCount:number;status:string;gameId:string|null;ruleset?:string;turnDurationMs?:number;botSlots?:number;botDifficulty?:string;players?:Array<{playerId:string;slotIndex:number;displayName:string;ready:boolean}>};

function browserOrigin():string{
  if(typeof window==="undefined") return "";
  return window.location.origin;
}
function socketEndpoint():string{
  const configured=process.env.NEXT_PUBLIC_REALTIME_URL?.trim().replace(/\/$/,"");
  if(configured) return configured;
  if(typeof window!=="undefined"){
    const protocol=window.location.protocol==="https:"?"wss:":"ws:";
    return `${protocol}//${window.location.host}/realtime`;
  }
  return "ws://localhost:4000";
}
function httpEndpoint():string{
  const configured=process.env.NEXT_PUBLIC_REALTIME_HTTP_URL?.trim().replace(/\/$/,"");
  if(configured) return configured;
  const socket=socketEndpoint();
  if(socket.startsWith("ws://")||socket.startsWith("wss://")) return socket.replace(/^ws/,"http");
  return browserOrigin();
}
const socketBase=socketEndpoint();
const httpBase=httpEndpoint();

async function readBody(response:Response):Promise<Record<string,unknown>>{
  const text=await response.text();
  if(!text) return {};
  try{return JSON.parse(text) as Record<string,unknown>}catch{return {error:text.slice(0,200)}}
}
function networkError(error:unknown,fallback:string):Error{
  if(error instanceof Error&&error.message) return error;
  return new Error(fallback);
}

export async function createGuest(displayName:string):Promise<Session>{
  const response=await fetch(httpBase+"/guest-session",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({displayName}),cache:"no-store"});
  const body=await readBody(response);
  if(!response.ok) throw new Error(String(body.error||`GUEST_SESSION_FAILED_${response.status}`));
  const session=body as unknown as Session;
  if(!session.playerId||!session.sessionToken) throw new Error("INVALID_GUEST_SESSION_RESPONSE");
  localStorage.setItem("portable-ludo-session",JSON.stringify(session));
  return session;
}
export function getSession():Session{
  const raw=localStorage.getItem("portable-ludo-session");
  if(!raw) throw new Error("NO_GUEST_SESSION");
  try{
    const session=JSON.parse(raw) as Session;
    if(!session.playerId||!session.displayName||!session.sessionToken) throw new Error("INVALID_GUEST_SESSION");
    if(session.expiresAt&&Date.parse(session.expiresAt)<=Date.now()) throw new Error("GUEST_SESSION_EXPIRED");
    return session;
  }catch(error){localStorage.removeItem("portable-ludo-session");throw networkError(error,"INVALID_GUEST_SESSION");}
}
function openSocket():Promise<WebSocket>{
  return new Promise((resolve,reject)=>{
    let ws:WebSocket;
    try{ws=new WebSocket(socketBase)}catch(error){reject(networkError(error,"REALTIME_CONNECTION_FAILED"));return}
    let settled=false;
    const fail=(error:Error)=>{if(!settled){settled=true;reject(error)}};
    ws.onopen=()=>{settled=true;resolve(ws)};
    ws.onerror=()=>fail(new Error("REALTIME_CONNECTION_FAILED"));
    ws.onclose=(event)=>{if(!settled) fail(new Error(`REALTIME_CONNECTION_CLOSED_${event.code}`))};
  });
}
function waitForMessage<T extends Record<string,unknown>>(ws:WebSocket,predicate:(message:Record<string,unknown>)=>boolean):Promise<T>{
  return new Promise((resolve,reject)=>{
    const timeout=window.setTimeout(()=>{ws.close();reject(new Error("REALTIME_RESPONSE_TIMEOUT"))},15000);
    const onMessage=(event:MessageEvent)=>{try{
      const message=JSON.parse(String(event.data)) as Record<string,unknown>;
      if(!predicate(message)) return;
      window.clearTimeout(timeout);ws.removeEventListener("message",onMessage);ws.close();
      if(message.type==="ERROR"){reject(new Error(String(message.code||"REALTIME_ERROR")));return}
      resolve(message as T);
    }catch{window.clearTimeout(timeout);ws.removeEventListener("message",onMessage);ws.close();reject(new Error("INVALID_REALTIME_RESPONSE"))}};
    ws.addEventListener("message",onMessage);
  });
}
export async function createRoom(session:Session,playerCount:2|4,ruleset:"STANDARD"|"LEAGUE"="STANDARD",options:{turnDurationMs?:number;botSlots?:number;difficulty?:"EASY"|"NORMAL"|"HARD"}={}):Promise<Room>{
  const ws=await openSocket();
  ws.send(JSON.stringify({type:"CREATE_ROOM",playerCount,ruleset,turnDurationMs:options.turnDurationMs,botSlots:options.botSlots??0,botDifficulty:options.difficulty??"NORMAL",sessionToken:session.sessionToken}));
  const message=await waitForMessage<{type:"ROOM_JOINED";room:Room}>(ws,m=>m.type==="ROOM_JOINED"||m.type==="ERROR");
  return message.room;
}
export async function roomStatus(code:string):Promise<Room>{
  const response=await fetch(httpBase+"/room-status?room="+encodeURIComponent(code),{cache:"no-store"});
  const body=await readBody(response);
  if(!response.ok) throw new Error(String(body.error||`ROOM_STATUS_FAILED_${response.status}`));
  return body as unknown as Room;
}
export function openRealtime():Promise<WebSocket>{return openSocket();}
export async function joinRoom(code:string,displayName:string):Promise<{room:Room;gameId:string|null}>{
  let session:Session;
  try{session=getSession()}catch(error){
    if(error instanceof Error&&(error.message==="NO_GUEST_SESSION"||error.message==="GUEST_SESSION_EXPIRED"||error.message==="INVALID_GUEST_SESSION")) session=await createGuest(displayName);
    else throw error;
  }
  const ws=await openSocket();
  ws.send(JSON.stringify({type:"ROOM_JOIN",roomId:code,playerId:session.playerId,displayName:session.displayName,sessionToken:session.sessionToken}));
  const message=await waitForMessage<{type:"ROOM_JOINED";room:Room;gameId:string|null}>(ws,m=>m.type==="ROOM_JOINED"||m.type==="ERROR");
  return {room:message.room,gameId:message.gameId};
}
export function connectGame(gameId:string,handlers:{state:(state:unknown)=>void;events:(events:unknown[])=>void;error:(error:unknown)=>void}){
  const session=getSession();
  const ws=new WebSocket(socketBase);
  let closed=false;
  ws.onopen=()=>ws.send(JSON.stringify({type:"RECONNECT",gameId,sessionToken:session.sessionToken}));
  ws.onmessage=e=>{try{
    const message=JSON.parse(String(e.data)) as Record<string,unknown>;
    if(message.type==="STATE") handlers.state(message.state);
    else if(message.type==="EVENTS") handlers.events(Array.isArray(message.events)?message.events:[]);
    else if(message.type==="ERROR") handlers.error(message);
  }catch{handlers.error({code:"INVALID_REALTIME_MESSAGE"})}};
  ws.onerror=()=>{if(!closed) handlers.error({code:"REALTIME_CONNECTION_FAILED"})};
  ws.onclose=()=>{if(!closed) handlers.error({code:"REALTIME_CONNECTION_CLOSED"})};
  const send=(message:Record<string,unknown>)=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(message));else handlers.error({code:"REALTIME_NOT_CONNECTED"})};
  return {roll:()=>send({type:"ROLL"}),move:(tokenId:number)=>send({type:"MOVE",tokenId}),close:()=>{closed=true;ws.close()}};
}