export type Session={playerId:string;displayName:string;sessionToken:string;expiresAt:string};
export type Room={id:string;code:string;playerCount:number;status:string;gameId:string|null};
const socketBase=process.env.NEXT_PUBLIC_REALTIME_URL?.replace(/\/$/,"")||"ws://localhost:4000";
const httpBase=socketBase.replace(/^ws/,"http");

export async function createGuest(displayName:string):Promise<Session>{
  const response=await fetch(httpBase+"/guest-session",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({displayName})});
  const body=await response.json() as Record<string,unknown>;
  if(!response.ok) throw new Error(String(body.error||"GUEST_SESSION_FAILED"));
  const session=body as unknown as Session;
  sessionStorage.setItem("portable-ludo-session",JSON.stringify(session));
  return session;
}

export function getSession():Session{
  const raw=sessionStorage.getItem("portable-ludo-session");
  if(!raw) throw new Error("NO_GUEST_SESSION");
  return JSON.parse(raw) as Session;
}

function openSocket():Promise<WebSocket>{
  return new Promise((resolve,reject)=>{
    const ws=new WebSocket(socketBase);
    ws.onopen=()=>resolve(ws);
    ws.onerror=()=>reject(new Error("REALTIME_CONNECTION_FAILED"));
  });
}

export async function createRoom(session:Session,playerCount:2|4):Promise<Room>{
  const ws=await openSocket();
  return new Promise((resolve,reject)=>{
    ws.onmessage=e=>{const message=JSON.parse(e.data);if(message.type==="ROOM_JOINED"){ws.close();resolve(message.room as Room)}else if(message.type==="ERROR"){ws.close();reject(new Error(message.code))}};
    ws.send(JSON.stringify({type:"CREATE_ROOM",playerCount,sessionToken:session.sessionToken}));
  });
}

export async function roomStatus(code:string):Promise<Room>{ const response=await fetch(httpBase+"/room-status?room="+encodeURIComponent(code),{cache:"no-store"}); const body=await response.json() as Record<string,unknown>; if(!response.ok) throw new Error(String(body.error||"ROOM_STATUS_FAILED")); return body as unknown as Room; }

export function openRealtime(): Promise<WebSocket> { return openSocket(); }

export async function joinRoom(code:string,displayName:string):Promise<{room:Room;gameId:string|null}>{
  let session:Session;
  try{session=getSession()}catch{session=await createGuest(displayName)}
  const ws=await openSocket();
  return new Promise((resolve,reject)=>{
    ws.onmessage=e=>{const message=JSON.parse(e.data);if(message.type==="ROOM_JOINED"){ws.close();resolve({room:message.room as Room,gameId:message.gameId})}else if(message.type==="ERROR"){ws.close();reject(new Error(message.code))}};
    ws.send(JSON.stringify({type:"ROOM_JOIN",roomId:code,playerId:session.playerId,displayName:session.displayName,sessionToken:session.sessionToken}));
  });
}

export function connectGame(gameId:string,handlers:{state:(state:unknown)=>void;events:(events:unknown[])=>void;error:(error:unknown)=>void}){
  const session=getSession();
  const ws=new WebSocket(socketBase);
  ws.onopen=()=>ws.send(JSON.stringify({type:"RECONNECT",gameId,sessionToken:session.sessionToken}));
  ws.onmessage=e=>{const message=JSON.parse(e.data);if(message.type==="STATE")handlers.state(message.state);else if(message.type==="EVENTS")handlers.events(message.events);else if(message.type==="ERROR")handlers.error(message)};
  return {roll:()=>ws.send(JSON.stringify({type:"ROLL"})),move:(tokenId:number)=>ws.send(JSON.stringify({type:"MOVE",tokenId})),close:()=>ws.close()};
}
