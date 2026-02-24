const grid=document.getElementById("grid");
const modal=document.getElementById("modal");
const input=document.getElementById("input");
const searchInput=document.getElementById("searchInput");
const importInput=document.getElementById("importInput");

let currentTab="songs";
let data=JSON.parse(localStorage.getItem("oneshelf"))||[];

document.querySelectorAll(".tabs button").forEach(btn=>{
  btn.onclick=()=>{currentTab=btn.dataset.type;render();}
});

document.getElementById("addBtn").onclick=()=>modal.classList.remove("hidden");
document.getElementById("searchBtn").onclick=()=>searchInput.classList.toggle("hidden");

document.getElementById("saveBtn").onclick=async()=>{
  const value=input.value.trim();
  if(!value) return;

  const item=await detectType(value);
  item.id=Date.now();
  data.push(item);
  save();
  input.value="";
  modal.classList.add("hidden");
  render();
};

modal.onclick=e=>{
  if(e.target===modal) modal.classList.add("hidden");
};

function save(){
  localStorage.setItem("oneshelf",JSON.stringify(data));
}

async function detectType(text){

  if(text.match(/\.(jpg|jpeg|png|webp)$/i))
    return{type:"images",title:"Image",thumbnail:text,url:text};

  if(text.includes("youtube")||text.includes("youtu.be")){
    const r=await fetch(`https://www.youtube.com/oembed?url=${text}&format=json`);
    const j=await r.json();
    return{type:"songs",title:j.title,thumbnail:j.thumbnail_url,url:text};
  }

  if(text.includes("spotify")){
    const r=await fetch(`https://open.spotify.com/oembed?url=${text}`);
    const j=await r.json();
    return{type:"songs",title:j.title,thumbnail:j.thumbnail_url,url:text};
  }

  if(text.includes("imdb")){
    try{
      const proxy=`https://api.allorigins.win/get?url=${encodeURIComponent(text)}`;
      const r=await fetch(proxy);
      const d=await r.json();
      const doc=new DOMParser().parseFromString(d.contents,"text/html");
      return{
        type:"movies",
        title:doc.querySelector("meta[property='og:title']")?.content||"Movie",
        thumbnail:doc.querySelector("meta[property='og:image']")?.content,
        url:text
      };
    }catch{return{type:"movies",title:"Movie",url:text};}
  }

  if(text.startsWith("http"))
    return{type:"links",title:text,url:text};

  return{type:"notes",title:text};
}

function render(){
  grid.innerHTML="";
  data
  .filter(i=>i.type===currentTab)
  .filter(i=>i.title.toLowerCase().includes(searchInput.value?.toLowerCase()||""))
  .forEach(item=>{
    const card=document.createElement("div");
    card.className="card glass";
    card.draggable=true;

    card.innerHTML=`
      ${item.thumbnail?`<img src="${item.thumbnail}">`:""}
      <h3 contenteditable="true">${item.title}</h3>
      <div class="card-actions">
        <button onclick="deleteItem(${item.id})"><i data-lucide="trash"></i></button>
      </div>
    `;

    card.ondragstart=e=>e.dataTransfer.setData("id",item.id);
    card.ondragover=e=>e.preventDefault();
    card.ondrop=e=>{
      const fromId=e.dataTransfer.getData("id");
      reorder(fromId,item.id);
    };

    grid.appendChild(card);
  });

  lucide.createIcons();
}

function deleteItem(id){
  data=data.filter(i=>i.id!==id);
  save();
  render();
}

function reorder(from,to){
  const fromIndex=data.findIndex(i=>i.id==from);
  const toIndex=data.findIndex(i=>i.id==to);
  const item=data.splice(fromIndex,1)[0];
  data.splice(toIndex,0,item);
  save();
  render();
}

searchInput.oninput=render;

document.getElementById("exportBtn").onclick=()=>{
  const blob=new Blob([JSON.stringify(data)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="oneshelf_backup.json";
  a.click();
};

importInput.onchange=e=>{
  const file=e.target.files[0];
  const reader=new FileReader();
  reader.onload=()=>{
    data=JSON.parse(reader.result);
    save();
    render();
  };
  reader.readAsText(file);
};

render();
