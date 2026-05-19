"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/browser";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Category    { id: number; name: string; sort_order: number; }
interface SubCategory { id: number; category_id: number; name: string; sort_order: number; }
interface MenuItem    { id: number; subcategory_id: number; name: string; sort_order: number; }
interface ManualContent {
  id: number; menu_item_id: number; title: string; body: string;
  image_urls: string[]; updated_at: string; updated_by: string | null;
}
interface SearchResult {
  itemId: number; itemName: string;
  catId: number;  catName: string;
  subId: number;  subName: string;
  matchIn: "name" | "title" | "body";
  snippet: string;
}

// ─── 초성 검색 ────────────────────────────────────────────────────────────────
const CHOSUNG = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"].map(ch=>ch.normalize("NFC"));
const JAMO_TO_CHOSUNG: Record<string,string> = {
  "\u3130":"\u3131","\u3131":"\u3131","\u3132":"\u3132","\u3133":"\u3131","\u3134":"\u3134","\u3135":"\u3134",
  "\u3136":"\u3134","\u3137":"\u3137","\u3138":"\u3138","\u3139":"\u3139","\u313a":"\u3139","\u313b":"\u3139",
  "\u313c":"\u3139","\u313d":"\u3139","\u313e":"\u3139","\u313f":"\u3139","\u3140":"\u3139",
  "\u3141":"\u3141","\u3142":"\u3142","\u3143":"\u3142","\u3144":"\u3142","\u3145":"\u3145","\u3146":"\u3146",
  "\u3147":"\u3147","\u3148":"\u3148","\u3149":"\u3149","\u314a":"\u314a","\u314b":"\u314b","\u314c":"\u314c",
  "\u314d":"\u314d","\u314e":"\u314e",
};
function getChosung(str: string) {
  return [...str].map(ch=>{ const c=ch.charCodeAt(0)-0xAC00; return(c>=0&&c<=11171)?CHOSUNG[Math.floor(c/588)]:""; }).join("");
}
function extractKeywordChosung(kw: string) {
  return [...kw].map(ch=>{ const c=ch.charCodeAt(0)-0xAC00; return(c>=0&&c<=11171)?CHOSUNG[Math.floor(c/588)]:(JAMO_TO_CHOSUNG[ch]??ch); }).join("");
}
function matchesSearch(target: string, keyword: string): boolean {
  if(!target||!keyword) return false;
  const t=target.toLowerCase(), k=keyword.normalize("NFC");
  if(t.includes(k.toLowerCase())) return true;
  const kc=extractKeywordChosung(k);
  if(kc.length>0&&[...kc].every(ch=>CHOSUNG.includes(ch))) return getChosung(target).includes(kc);
  return false;
}
function extractSnippet(body: string, kw: string, maxLen=90): string {
  if(!body) return "";
  const lower=body.toLowerCase(), kl=kw.toLowerCase();
  const idx=lower.indexOf(kl);
  if(idx===-1) return body.slice(0,maxLen)+(body.length>maxLen?"…":"");
  const s=Math.max(0,idx-20), e=Math.min(body.length,idx+kw.length+50);
  return(s>0?"…":"")+body.slice(s,e)+(e<body.length?"…":"");
}
function Highlight({text,q}:{text:string;q:string}) {
  if(!q||!text) return <>{text}</>;
  const lower=text.toLowerCase(), kl=q.toLowerCase(), idx=lower.indexOf(kl);
  if(idx===-1) return <>{text}</>;
  return <>{text.slice(0,idx)}<mark style={{background:"#fef08a",borderRadius:2,padding:"0 1px"}}>{text.slice(idx,idx+q.length)}</mark>{text.slice(idx+q.length)}</>;
}

// ─── 간단 RTE 툴바 ────────────────────────────────────────────────────────────
// body는 마크다운 유사 텍스트로 저장, 뷰에서 렌더
function applyFormat(textarea: HTMLTextAreaElement, prefix: string, suffix: string) {
  const s=textarea.selectionStart, e=textarea.selectionEnd;
  const sel=textarea.value.slice(s,e)||"텍스트";
  const before=textarea.value.slice(0,s), after=textarea.value.slice(e);
  return before+prefix+sel+suffix+after;
}
function RteToolbar({onFormat}:{onFormat:(fn:(v:string,ta:HTMLTextAreaElement)=>string)=>void}) {
  const btn=(label:string,fn:(v:string,ta:HTMLTextAreaElement)=>string,title?:string)=>(
    <button type="button" title={title||label} onClick={()=>onFormat(fn)}
      style={{padding:"3px 8px",border:"1px solid #ddd",borderRadius:5,background:"#f8f9fb",cursor:"pointer",fontSize:12,fontWeight:600,color:"#444"}}>
      {label}
    </button>
  );
  return(
    <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:6}}>
      {btn("굵게",(v,ta)=>applyFormat(ta,"**","**"),"굵게 (Ctrl+B)")}
      {btn("기울임",(v,ta)=>applyFormat(ta,"_","_"))}
      {btn("밑줄",(v,ta)=>applyFormat(ta,"<u>","</u>"))}
      {btn("H2",(v,ta)=>applyFormat(ta,"\n## ",""))}
      {btn("H3",(v,ta)=>applyFormat(ta,"\n### ",""))}
      {btn("• 목록",(v,ta)=>applyFormat(ta,"\n- ",""))}
      {btn("번호",(v,ta)=>applyFormat(ta,"\n1. ",""))}
      {btn("구분선",(v,ta)=>{ const s=ta.selectionStart; const b=v.slice(0,s), a=v.slice(s); return b+"\n---\n"+a; })}
      {btn("코드",(v,ta)=>applyFormat(ta,"`","`"))}
    </div>
  );
}

// 마크다운 → HTML (간단 렌더러)
function renderBody(body: string): string {
  if(!body) return "";
  let h = body
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    // 구분선
    .replace(/^---$/gm,"<hr style='border:none;border-top:1.5px solid #e2e5ea;margin:16px 0'>")
    // h2, h3
    .replace(/^### (.+)$/gm,"<h3 style='font-size:15px;font-weight:700;margin:16px 0 6px;color:#1a1a2e'>$1</h3>")
    .replace(/^## (.+)$/gm,"<h2 style='font-size:18px;font-weight:700;margin:20px 0 8px;color:#1a1a2e'>$1</h2>")
    // bold, italic, underline, code (unescape for html tags)
    .replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")
    .replace(/_(.+?)_/g,"<em>$1</em>")
    .replace(/`(.+?)`/g,"<code style='background:#f0f4ff;color:#2d5be3;border-radius:3px;padding:1px 5px;font-size:13px'>$1</code>")
    .replace(/&lt;u&gt;(.+?)&lt;\/u&gt;/g,"<u>$1</u>")
    // bullet list
    .replace(/^- (.+)$/gm,"<li style='margin:3px 0'>$1</li>")
    .replace(/(<li.*<\/li>\n?)+/g,"<ul style='padding-left:20px;margin:8px 0'>$&</ul>")
    // numbered list
    .replace(/^\d+\. (.+)$/gm,"<li style='margin:3px 0'>$1</li>")
    // 줄바꿈
    .replace(/\n/g,"<br/>");
  return h;
}



// ─── 드래그 순서 변경 훅 ─────────────────────────────────────────────────────
// ─── 직원 선택 그리드 (PIN 모달용) ──────────────────────────────────────────
function EmployeeGrid({emps,onSelect,onCancel}:{
    emps:{name:string;pin:string|null}[];
    onSelect:(name:string)=>void;
    onCancel:()=>void;
  }) {
      return(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,maxHeight:320,overflowY:"auto",marginBottom:12}}>
            {emps.map(e=>(
            <button key={e.name} onClick={()=>onSelect(e.name)}
              style={{padding:"12px 8px",border:"1px solid #e2e5ea",borderRadius:8,background:"#f8f9fb",cursor:"pointer",textAlign:"center",fontSize:13,fontWeight:600,color:"#333"}}>
              <div>{e.name}</div>
              <div style={{fontSize:11,color:"#aaa",marginTop:2,fontWeight:400}}>{e.pin?"PIN 설정됨":"PIN 미설정"}</div>
            </button>
          ))}
        </div>
        <button onClick={onCancel} style={{width:"100%",padding:"8px 0",background:"#f0f0f0",border:"none",borderRadius:6,cursor:"pointer",fontSize:13}}>취소</button>
      </div>
    );
  }
  
  function useDragOrder<T extends {id:number;sort_order:number}>(
  items: T[],
  onReorder: (reordered: T[]) => Promise<void>
) {
  const dragIdx = useRef<number|null>(null);
  const handlers = (idx: number) => ({
    draggable: true,
    onDragStart: () => { dragIdx.current = idx; },
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); },
    onDrop: async () => {
      const from = dragIdx.current;
      if(from===null||from===idx) return;
      const arr = [...items];
      const [moved] = arr.splice(from,1);
      arr.splice(idx,0,moved);
      const reordered = arr.map((item,i)=>({...item,sort_order:i}));
      dragIdx.current = null;
      await onReorder(reordered);
    },
  });
  return handlers;
}

export default function ManualPage() {
    const supabase = useMemo(() => createClient(), []);
  
    // ── data ──
    const [categories,    setCategories]    = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<SubCategory[]>([]);
  const [menuItems,     setMenuItems]     = useState<MenuItem[]>([]);
  const [contents,      setContents]      = useState<Record<number,ManualContent>>({});

  // ── selection ──
  const [selectedCat,  setSelectedCat]  = useState<number|null>(null);
  const [selectedSub,  setSelectedSub]  = useState<number|null>(null);
  const [selectedItem, setSelectedItem] = useState<number|null>(null);

  // ── admin ──
  const [isAdmin,    setIsAdmin]    = useState(false);
  const [showPin,    setShowPin]    = useState(false);
  const [pinInput,   setPinInput]   = useState("");
  const [pinError,   setPinError]   = useState("");
  const [showManage, setShowManage] = useState(false);
  const [adminName,       setAdminName]       = useState("");
  const [pinSelectedName, setPinSelectedName] = useState("");
  const [employees,       setEmployees]       = useState<{name:string;pin:string|null}[]>([]);

  // 직원 목록 로드
  useEffect(()=>{
    supabase.from("employees").select("name,pin").is("resign_date",null).order("name").limit(100)
      .then(({data,error})=>{ 
        if(data) setEmployees(data); 
        if(error) console.error("직원 목록 로드 실패:", error.message);
      });
  },[]);

  // ── edit ──
  const [editing,    setEditing]    = useState(false);
  const [editTitle,  setEditTitle]  = useState("");
  const [editBody,   setEditBody]   = useState("");
  const [editImages, setEditImages] = useState<string[]>([]);
  const [uploading,  setUploading]  = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── lightbox ──
  const [lightbox, setLightbox] = useState<string|null>(null);

  // ── new item inputs ──
  const [newCatName,  setNewCatName]  = useState("");
  const [newSubName,  setNewSubName]  = useState("");
  const [newItemName, setNewItemName] = useState("");

  // ── search ──
  const [searchRaw,     setSearchRaw]     = useState("");
  const [searchQuery,   setSearchQuery]   = useState("");  // debounced
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showDropdown,  setShowDropdown]  = useState(false);
  const searchWrapRef  = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceTimer  = useRef<ReturnType<typeof setTimeout>|null>(null);

  const contentRef  = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── mobile sidebar ──
  const [showSidebar, setShowSidebar] = useState(false);

  // ─── load all ──────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    const [{data:cats},{data:subs},{data:items},{data:cnts}] = await Promise.all([
      supabase.from("manual_categories").select("*").order("sort_order"),
      supabase.from("manual_subcategories").select("*").order("sort_order"),
      supabase.from("manual_menu_items").select("*").order("sort_order"),
      supabase.from("manual_contents").select("*"),
    ]);
    setCategories(cats||[]);
    setSubcategories(subs||[]);
    setMenuItems(items||[]);
    const map: Record<number,ManualContent>={};
    (cnts||[]).forEach((c:ManualContent)=>{map[c.menu_item_id]=c;});
    setContents(map);
  },[]);
  useEffect(()=>{loadAll();},[loadAll]);

  // ── 검색 바깥 클릭 ──
  useEffect(()=>{
    const h=(e:MouseEvent)=>{ if(searchWrapRef.current&&!searchWrapRef.current.contains(e.target as Node)) setShowDropdown(false); };
    document.addEventListener("mousedown",h);
    return ()=>document.removeEventListener("mousedown",h);
  },[]);

  // ── debounce 300ms ──
  useEffect(()=>{
    if(debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(()=>setSearchQuery(searchRaw.trim()),300);
    return ()=>{ if(debounceTimer.current) clearTimeout(debounceTimer.current); };
  },[searchRaw]);

  // ── 검색 실행 ──
  useEffect(()=>{
    if(!searchQuery){setSearchResults([]);setShowDropdown(false);return;}
    const results:SearchResult[]=[];
    for(const item of menuItems){
      const sub=subcategories.find(s=>s.id===item.subcategory_id); if(!sub) continue;
      const cat=categories.find(c=>c.id===sub.category_id); if(!cat) continue;
      const content=contents[item.id];
      let matched=false, matchIn:"name"|"title"|"body"="name", snippet="";
      if(matchesSearch(item.name,searchQuery)){matched=true;matchIn="name";snippet=item.name;}
      else if(content?.title&&matchesSearch(content.title,searchQuery)){matched=true;matchIn="title";snippet=content.title;}
      else if(content?.body&&matchesSearch(content.body,searchQuery)){matched=true;matchIn="body";snippet=extractSnippet(content.body,searchQuery);}
      else if(matchesSearch(sub.name,searchQuery)){matched=true;matchIn="name";snippet=`[${sub.name}] ${item.name}`;}
      else if(matchesSearch(cat.name,searchQuery)){matched=true;matchIn="name";snippet=`[${cat.name}] ${item.name}`;}
      if(matched) results.push({itemId:item.id,itemName:item.name,catId:cat.id,catName:cat.name,subId:sub.id,subName:sub.name,matchIn,snippet});
    }
    results.sort((a,b)=>({name:0,title:1,body:2}[a.matchIn]-{name:0,title:1,body:2}[b.matchIn]));
    setSearchResults(results);
    setShowDropdown(true);
  },[searchQuery,menuItems,subcategories,categories,contents]);

  // ── 검색 결과 이동 ──
  const jumpToItem = useCallback((r:SearchResult)=>{
    setSelectedCat(r.catId); setSelectedSub(r.subId); setSelectedItem(r.itemId);
    setEditing(false); setSearchRaw(""); setSearchQuery(""); setShowDropdown(false);
    setShowSidebar(false);
    setTimeout(()=>contentRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),150);
  },[]);

  // ── derived ──
  const filteredSubs  = subcategories.filter(s=>s.category_id===selectedCat);
  const filteredItems = menuItems.filter(m=>m.subcategory_id===selectedSub);
  const currentContent = selectedItem?contents[selectedItem]:null;

  // 미작성 항목 수
  const missingCount = (catId:number)=>{
    const subIds=subcategories.filter(s=>s.category_id===catId).map(s=>s.id);
    const allItems=menuItems.filter(m=>subIds.includes(m.subcategory_id));
    return allItems.filter(m=>!contents[m.id]).length;
  };
  const missingSubCount = (subId:number)=>menuItems.filter(m=>m.subcategory_id===subId&&!contents[m.id]).length;
  const totalItems  = (catId:number)=>{ const subIds=subcategories.filter(s=>s.category_id===catId).map(s=>s.id); return menuItems.filter(m=>subIds.includes(m.subcategory_id)).length; };
  const totalSubItems=(subId:number)=>menuItems.filter(m=>m.subcategory_id===subId).length;

  // ── PIN 검증 (이름 선택 후 PIN 매칭) ──
  const handlePin=async()=>{
    const pin=pinInput.trim();
    if(!pin){setPinError("PIN을 입력하세요.");return;}
    const found=employees.find(e=>e.name===pinSelectedName&&e.pin===pin);
    if(!found){setPinError("PIN이 올바르지 않습니다.");return;}
    setIsAdmin(true);
    setAdminName(pinSelectedName);
    setShowPin(false);
    setPinInput("");
    setPinError("");
    setPinSelectedName("");
  };

  const selectItem=(id:number)=>{ setSelectedItem(id);setEditing(false);setShowSidebar(false);setTimeout(()=>contentRef.current?.scrollIntoView({behavior:"smooth"}),100); };

  const startEdit=()=>{
    if(currentContent){setEditTitle(currentContent.title||"");setEditBody(currentContent.body||"");setEditImages(currentContent.image_urls||[]);}
    else{setEditTitle("");setEditBody("");setEditImages([]);}
    setEditing(true);
  };

  // RTE 포맷 적용
  const handleFormat=(fn:(v:string,ta:HTMLTextAreaElement)=>string)=>{
    const ta=textareaRef.current; if(!ta) return;
    const newVal=fn(editBody,ta);
    setEditBody(newVal);
    setTimeout(()=>{ ta.focus(); });
  };

  // ── 이미지 업로드 (Public 버킷) ──
  const handleImageUpload=async(e:React.ChangeEvent<HTMLInputElement>)=>{
    const files=Array.from(e.target.files||[]); if(!files.length) return;
    setUploading(true);
    const newUrls:string[]=[];
    for(const file of files){
      const ext=file.name.split(".").pop();
      const path=`manual/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const{error}=await supabase.storage.from("manual-images").upload(path,file,{upsert:false});
      if(!error){
        // Public 버킷이므로 getPublicUrl 사용
        const{data:pub}=supabase.storage.from("manual-images").getPublicUrl(path);
        newUrls.push(pub.publicUrl);
      }
    }
    setEditImages(prev=>[...prev,...newUrls]); setUploading(false);
    if(fileInputRef.current) fileInputRef.current.value="";
  };

  const removeImage=(url:string)=>setEditImages(prev=>prev.filter(u=>u!==url));

  // ── 저장 (updated_by 포함) ──
  const saveContent=async()=>{
    if(!selectedItem) return;
    const payload={title:editTitle,body:editBody,image_urls:editImages,updated_at:new Date().toISOString(),updated_by:adminName||"관리자"};
    if(currentContent){
      const{error}=await supabase.from("manual_contents").update(payload).eq("menu_item_id",selectedItem);
      if(error){alert("저장 실패: "+error.message);return;}
    }else{
      const{error}=await supabase.from("manual_contents").insert({menu_item_id:selectedItem,...payload});
      if(error){alert("저장 실패: "+error.message);return;}
    }
    await loadAll(); setEditing(false);
  };

  // ── CRUD ──
  const addCategory=async()=>{
    if(!newCatName.trim()) return;
    await supabase.from("manual_categories").insert({name:newCatName.trim(),sort_order:categories.length});
    setNewCatName(""); await loadAll();
  };
  const delCategory=async(id:number)=>{
    if(!confirm("대분류를 삭제하면 하위 항목이 모두 삭제됩니다.")) return;
    await supabase.from("manual_categories").delete().eq("id",id);
    await loadAll(); setSelectedCat(null); setSelectedSub(null); setSelectedItem(null);
  };
  const addSub=async()=>{
    if(!newSubName.trim()||!selectedCat) return;
    await supabase.from("manual_subcategories").insert({category_id:selectedCat,name:newSubName.trim(),sort_order:filteredSubs.length});
    setNewSubName(""); await loadAll();
  };
  const delSub=async(id:number)=>{
    if(!confirm("중분류를 삭제하면 하위 항목이 모두 삭제됩니다.")) return;
    await supabase.from("manual_subcategories").delete().eq("id",id);
    await loadAll(); setSelectedSub(null); setSelectedItem(null);
  };
  const addItem=async()=>{
    if(!newItemName.trim()||!selectedSub) return;
    await supabase.from("manual_menu_items").insert({subcategory_id:selectedSub,name:newItemName.trim(),sort_order:filteredItems.length});
    setNewItemName(""); await loadAll();
  };
  const delItem=async(id:number)=>{
    if(!confirm("소분류를 삭제합니다.")) return;
    await supabase.from("manual_menu_items").delete().eq("id",id);
    await loadAll(); if(selectedItem===id) setSelectedItem(null);
  };

  // ── 드래그 순서 변경 ──
  const reorderCategories=async(reordered:Category[])=>{
    setCategories(reordered);
    for(const c of reordered) await supabase.from("manual_categories").update({sort_order:c.sort_order}).eq("id",c.id);
  };
  const reorderSubs=async(reordered:SubCategory[])=>{
    setSubcategories(prev=>[...prev.filter(s=>s.category_id!==selectedCat),...reordered]);
    for(const s of reordered) await supabase.from("manual_subcategories").update({sort_order:s.sort_order}).eq("id",s.id);
  };
  const reorderItems=async(reordered:MenuItem[])=>{
    setMenuItems(prev=>[...prev.filter(m=>m.subcategory_id!==selectedSub),...reordered]);
    for(const m of reordered) await supabase.from("manual_menu_items").update({sort_order:m.sort_order}).eq("id",m.id);
  };

  const catDrag  = useDragOrder(categories,   reorderCategories);
  const subDrag  = useDragOrder(filteredSubs,  reorderSubs);
  const itemDrag = useDragOrder(filteredItems, reorderItems);

  // ─── Styles ────────────────────────────────────────────────────────────────
  const blue="#2d5be3", blueLt="#eef2ff", blueMd="#dce5ff", border="#e2e5ea", white="#fff";
  const inp:React.CSSProperties={width:"100%",padding:"7px 10px",border:`1px solid ${border}`,borderRadius:6,fontSize:13,boxSizing:"border-box",background:white};

  // ─── Sidebar content (shared between desktop and mobile overlay) ───────────
  const SidebarContent = useCallback(()=>(
    <div style={{background:white,borderRadius:10,border:`1px solid ${border}`,overflow:"hidden"}}>
      <div style={{padding:"12px 16px",background:"#f8f9fb",borderBottom:`1px solid ${border}`,fontWeight:700,fontSize:13,color:"#555",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <span>카테고리</span>
        {isAdmin&&showManage&&<span style={{fontSize:11,color:"#aaa"}}>드래그로 순서변경</span>}
      </div>

      {/* 대분류 추가 */}
      {isAdmin&&showManage&&(
        <div style={{padding:"8px 12px",borderBottom:"1px solid #eee",display:"flex",gap:6}}>
          <input value={newCatName} onChange={e=>setNewCatName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCategory()} placeholder="대분류 추가" style={{...inp,padding:"4px 8px",fontSize:12}}/>
          <button onClick={addCategory} style={{padding:"4px 10px",background:blue,color:white,border:"none",borderRadius:5,cursor:"pointer",fontSize:12}}>+</button>
        </div>
      )}

      {categories.map((cat,catIdx)=>{
        const isSel=selectedCat===cat.id;
        const missing=missingCount(cat.id), total=totalItems(cat.id);
        return(
          <div key={cat.id} {...(isAdmin&&showManage?catDrag(catIdx):{})}>
            <div onClick={()=>{ setSelectedCat(isSel?null:cat.id); setSelectedSub(null); setSelectedItem(null); }}
              style={{padding:"10px 16px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",background:isSel?blueLt:"transparent",borderLeft:`3px solid ${isSel?blue:"transparent"}`,userSelect:"none"}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                {isAdmin&&showManage&&<span style={{color:"#ccc",fontSize:13,cursor:"grab"}}>⠿</span>}
                <span style={{fontWeight:isSel?700:500,color:isSel?blue:"#333",fontSize:13}}>{cat.name}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:4}}>
                {/* 전체 항목 수 */}
                <span style={{fontSize:11,background:"#e8edf8",color:blue,borderRadius:10,padding:"1px 7px",fontWeight:600}}>{total}</span>
                {/* 미작성 뱃지 */}
                {missing>0&&<span style={{fontSize:11,background:"#fee2e2",color:"#dc2626",borderRadius:10,padding:"1px 6px",fontWeight:600}}>미{missing}</span>}
                {isAdmin&&showManage&&<button onClick={e=>{e.stopPropagation();delCategory(cat.id);}} style={{background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:14,padding:0}}>×</button>}
              </div>
            </div>
            {isSel&&(
              <div style={{background:"#f8f9fb"}}>
                {/* 중분류 추가 */}
                {isAdmin&&showManage&&(
                  <div style={{padding:"6px 12px 6px 28px",display:"flex",gap:6}}>
                    <input value={newSubName} onChange={e=>setNewSubName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addSub()} placeholder="중분류 추가" style={{...inp,padding:"3px 7px",fontSize:11}}/>
                    <button onClick={addSub} style={{padding:"3px 8px",background:blue,color:white,border:"none",borderRadius:4,cursor:"pointer",fontSize:11}}>+</button>
                  </div>
                )}
                {filteredSubs.map((sub,subIdx)=>{
                  const isSubSel=selectedSub===sub.id;
                  const mSub=missingSubCount(sub.id), tSub=totalSubItems(sub.id);
                  return(
                    <div key={sub.id} {...(isAdmin&&showManage?subDrag(subIdx):{})}>
                      <div onClick={()=>{ setSelectedSub(isSubSel?null:sub.id); setSelectedItem(null); }}
                        style={{padding:"8px 14px 8px 28px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",background:isSubSel?blueMd:"transparent",borderLeft:`3px solid ${isSubSel?"#6b8ef5":"transparent"}`}}>
                        <div style={{display:"flex",alignItems:"center",gap:5}}>
                          {isAdmin&&showManage&&<span style={{color:"#ccc",fontSize:12,cursor:"grab"}}>⠿</span>}
                          <span style={{fontSize:12,color:isSubSel?blue:"#555",fontWeight:isSubSel?600:400}}>└ {sub.name}</span>
                        </div>
                        <div style={{display:"flex",gap:4,alignItems:"center"}}>
                          <span style={{fontSize:10,background:blueMd,color:"#4a6fd4",borderRadius:8,padding:"1px 6px"}}>{tSub}</span>
                          {mSub>0&&<span style={{fontSize:10,background:"#fee2e2",color:"#dc2626",borderRadius:8,padding:"1px 5px",fontWeight:600}}>미{mSub}</span>}
                          {isAdmin&&showManage&&<button onClick={e=>{e.stopPropagation();delSub(sub.id);}} style={{background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:13,padding:0}}>×</button>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {categories.length===0&&<div style={{padding:"24px 16px",color:"#aaa",fontSize:13,textAlign:"center"}}>{isAdmin?"대분류를 추가해주세요":"항목이 없습니다"}</div>}
    </div>
  ),[categories,subcategories,menuItems,contents,selectedCat,selectedSub,selectedItem,isAdmin,showManage,newCatName,newSubName,newItemName,catDrag,subDrag,itemDrag,filteredSubs,filteredItems,blue,blueLt,blueMd,border,white,inp]);

  return(
    <div style={{fontFamily:"'Malgun Gothic','Apple SD Gothic Neo',sans-serif",fontSize:14,background:"#f5f6f8",minHeight:"100vh",color:"#333"}}>

      {/* ── Lightbox ── */}
      {lightbox&&(
        <div onClick={()=>setLightbox(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",cursor:"zoom-out"}}>
          <img src={lightbox} style={{maxWidth:"92vw",maxHeight:"92vh",borderRadius:8,boxShadow:"0 8px 40px rgba(0,0,0,0.6)"}} onClick={e=>e.stopPropagation()}/>
          <button onClick={()=>setLightbox(null)} style={{position:"fixed",top:20,right:28,background:"none",border:"none",color:white,fontSize:36,cursor:"pointer",lineHeight:1}}>×</button>
        </div>
      )}

      {/* ── PIN Modal ── */}
      {showPin&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:white,borderRadius:12,padding:"24px 28px",width:"100%",maxWidth:480,boxShadow:"0 8px 40px rgba(0,0,0,0.2)"}}>
            <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>본인 확인</div>
            <div style={{color:"#888",fontSize:12,marginBottom:16}}>이름을 선택하고 PIN을 입력하세요</div>

            {/* 직원 선택 단계 */}
            {!pinSelectedName ? (
              <EmployeeGrid
              emps={employees}
              onSelect={(name)=>{ setPinSelectedName(name); setPinError(""); }}
              onCancel={()=>{ setShowPin(false); setPinInput(""); setPinError(""); setPinSelectedName(""); }}
            />
            ) : (
              /* PIN 입력 단계 */
              <div>
                <div style={{marginBottom:12,fontWeight:600,fontSize:14,color:blue}}>👤 {pinSelectedName}</div>
                <input type="password" value={pinInput} onChange={e=>setPinInput(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&handlePin()} autoFocus
                  placeholder="PIN 입력" style={{...inp,marginBottom:6}}/>
                {pinError&&<div style={{color:"#e53e3e",fontSize:12,marginBottom:8}}>{pinError}</div>}
                <div style={{display:"flex",gap:8,marginTop:8}}>
                  <button onClick={handlePin} style={{flex:1,padding:"9px 0",background:blue,color:white,border:"none",borderRadius:6,cursor:"pointer",fontWeight:600}}>확인</button>
                  <button onClick={()=>{ setPinSelectedName(""); setPinInput(""); setPinError(""); }} style={{flex:1,padding:"9px 0",background:"#f0f0f0",border:"none",borderRadius:6,cursor:"pointer"}}>뒤로</button>
                  <button onClick={()=>{ setShowPin(false); setPinInput(""); setPinError(""); setPinSelectedName(""); }} style={{padding:"9px 14px",background:"#f0f0f0",border:"none",borderRadius:6,cursor:"pointer"}}>취소</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 모바일 사이드바 오버레이 ── */}
      {showSidebar&&(
        <div style={{position:"fixed",inset:0,zIndex:800,display:"flex"}}>
          <div style={{width:280,background:white,overflowY:"auto",padding:12,boxShadow:"4px 0 20px rgba(0,0,0,0.15)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <span style={{fontWeight:700,color:blue}}>카테고리</span>
              <button onClick={()=>setShowSidebar(false)} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"#888"}}>×</button>
            </div>
            <SidebarContent/>
          </div>
          <div style={{flex:1,background:"rgba(0,0,0,0.4)"}} onClick={()=>setShowSidebar(false)}/>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{background:white,borderBottom:`1px solid ${border}`,padding:"10px 16px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        {/* 모바일 햄버거 */}
        <button onClick={()=>setShowSidebar(true)} style={{display:"none",padding:"6px 8px",background:"none",border:`1px solid ${border}`,borderRadius:6,cursor:"pointer",fontSize:18}} className="manual-hamburger">☰</button>

        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          <span style={{fontWeight:700,fontSize:17,color:blue}}>📖 메뉴얼</span>
          <span style={{color:"#bbb",fontSize:12,display:"none"}} className="manual-subtitle-hide">BONUSMATE ERP</span>
        </div>

        {/* 검색 */}
        <div ref={searchWrapRef} style={{flex:1,minWidth:180,maxWidth:500,position:"relative"}}>
          <div style={{position:"relative",display:"flex",alignItems:"center"}}>
            <span style={{position:"absolute",left:10,fontSize:13,color:"#aaa",pointerEvents:"none"}}>🔍</span>
            <input ref={searchInputRef} value={searchRaw}
              onChange={e=>setSearchRaw(e.target.value)}
              onFocus={()=>{if(searchResults.length>0||searchRaw) setShowDropdown(true);}}
              onKeyDown={e=>{
                if(e.key==="Escape"){setSearchRaw("");setShowDropdown(false);}
                if(e.key==="Enter"&&searchResults.length>0) jumpToItem(searchResults[0]);
              }}
              placeholder="검색 (초성 가능) · 소분류명·제목·본문"
              style={{width:"100%",padding:"7px 30px 7px 30px",border:`1.5px solid ${showDropdown&&searchRaw?blue:border}`,borderRadius:20,fontSize:13,outline:"none",background:white,transition:"border-color 0.15s",boxSizing:"border-box"}}
            />
            {searchRaw&&<button onClick={()=>{setSearchRaw("");setShowDropdown(false);}} style={{position:"absolute",right:9,background:"none",border:"none",cursor:"pointer",color:"#bbb",fontSize:16,padding:2,lineHeight:1}}>×</button>}
          </div>

          {/* 드롭다운 */}
          {showDropdown&&searchRaw.trim()&&(
            <div style={{position:"absolute",top:"calc(100% + 5px)",left:0,right:0,background:white,border:`1px solid ${border}`,borderRadius:10,boxShadow:"0 8px 32px rgba(0,0,0,0.13)",zIndex:600,maxHeight:400,overflowY:"auto"}}>
              {searchResults.length>0?(
                <>
                  <div style={{padding:"6px 14px 4px",fontSize:11,color:"#999",borderBottom:`1px solid ${border}`,display:"flex",justifyContent:"space-between"}}>
                    <span>검색 결과 <strong style={{color:blue}}>{searchResults.length}건</strong></span>
                    <span style={{fontSize:10}}>Enter → 첫번째 이동</span>
                  </div>
                  {searchResults.map((r,i)=>{
                    const mc={name:blueLt,title:"#dcfce7",body:"#fef3c7"}[r.matchIn];
                    const mt={name:blue,title:"#166534",body:"#92400e"}[r.matchIn];
                    const ml={name:"항목명",title:"제목",body:"본문"}[r.matchIn];
                    return(
                      <div key={`${r.itemId}-${i}`} onClick={()=>jumpToItem(r)}
                        onMouseEnter={e=>(e.currentTarget.style.background=blueLt)}
                        onMouseLeave={e=>(e.currentTarget.style.background=white)}
                        style={{padding:"9px 14px",cursor:"pointer",borderBottom:`1px solid ${border}`,transition:"background 0.08s"}}>
                        <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:3,flexWrap:"wrap"}}>
                          <span style={{background:blueLt,color:blue,fontSize:11,borderRadius:4,padding:"1px 6px",fontWeight:600}}>{r.catName}</span>
                          <span style={{color:"#ccc",fontSize:11}}>›</span>
                          <span style={{background:blueMd,color:blue,fontSize:11,borderRadius:4,padding:"1px 6px"}}>{r.subName}</span>
                          <span style={{color:"#ccc",fontSize:11}}>›</span>
                          <span style={{fontWeight:600,fontSize:12}}>{r.itemName}</span>
                          <span style={{background:mc,color:mt,fontSize:10,borderRadius:4,padding:"1px 5px",marginLeft:2}}>{ml}</span>
                        </div>
                        <div style={{fontSize:12,color:"#555",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                          <Highlight text={r.snippet} q={searchQuery}/>
                        </div>
                      </div>
                    );
                  })}
                </>
              ):(
                <div style={{padding:"16px 14px",textAlign:"center",color:"#aaa",fontSize:13}}>
                  "<strong style={{color:"#555"}}>{searchRaw}</strong>"에 해당하는 항목이 없습니다.
                </div>
              )}
            </div>
          )}
        </div>

        {/* 관리자 버튼 */}
        <div style={{display:"flex",gap:6,flexShrink:0}}>
          {isAdmin?(
            <>
              <button onClick={()=>setShowManage(v=>!v)}
                style={{padding:"5px 12px",background:showManage?blue:blueLt,color:showManage?white:blue,border:`1px solid ${blue}`,borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:600,whiteSpace:"nowrap"}}>
                {showManage?"관리 닫기":"항목 관리"}
              </button>
              <button onClick={()=>{setIsAdmin(false);setAdminName("");}} style={{padding:"5px 12px",background:white,color:"#888",border:`1px solid ${border}`,borderRadius:6,cursor:"pointer",fontSize:13}}>종료</button>
            </>
          ):(
            <button onClick={()=>setShowPin(true)} style={{padding:"5px 12px",background:"#f8f9fa",color:"#555",border:`1px solid ${border}`,borderRadius:6,cursor:"pointer",fontSize:13,whiteSpace:"nowrap"}}>🔐 관리자</button>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{display:"flex",maxWidth:1400,margin:"0 auto",padding:"16px"}}>

        {/* ── Desktop 사이드바 ── */}
        <div style={{width:240,flexShrink:0,marginRight:18}} className="manual-sidebar-desktop">
          <SidebarContent/>
        </div>

        {/* ── 콘텐츠 영역 ── */}
        <div style={{flex:1,minWidth:0}}>

          {/* sticky 소분류 탭 */}
          {selectedSub&&(
            <div style={{position:"sticky",top:0,zIndex:100,background:white,border:`1px solid ${border}`,borderRadius:10,marginBottom:14,padding:"10px 14px",boxShadow:"0 2px 8px rgba(0,0,0,0.07)"}}>
              <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
                <span style={{fontSize:12,color:"#aaa",whiteSpace:"nowrap"}}>소분류:</span>
                {filteredItems.map((item,itemIdx)=>(
                  <div key={item.id} {...(isAdmin&&showManage?itemDrag(itemIdx):{})} style={{display:"flex",alignItems:"center"}}>
                    {isAdmin&&showManage&&<span style={{color:"#ccc",fontSize:12,cursor:"grab",marginRight:2}}>⠿</span>}
                    <button onClick={()=>selectItem(item.id)}
                      style={{padding:"4px 12px",borderRadius:20,border:selectedItem===item.id?`2px solid ${blue}`:"1px solid #ddd",background:selectedItem===item.id?blue:"#f8f9fb",color:selectedItem===item.id?white:"#444",cursor:"pointer",fontSize:13,fontWeight:selectedItem===item.id?600:400,display:"flex",alignItems:"center",gap:5,position:"relative"}}>
                      {item.name}
                      {contents[item.id]
                        ?<span style={{fontSize:10,opacity:0.7}}>✓</span>
                        :<span style={{fontSize:10,color:selectedItem===item.id?"rgba(255,255,255,0.7)":"#f87171",fontWeight:700}}>●</span>
                      }
                      {isAdmin&&showManage&&<span onClick={e=>{e.stopPropagation();delItem(item.id);}} style={{fontSize:12,color:selectedItem===item.id?"rgba(255,255,255,0.6)":"#ccc",marginLeft:1,cursor:"pointer"}}>×</span>}
                    </button>
                  </div>
                ))}
                {isAdmin&&showManage&&(
                  <div style={{display:"flex",gap:5}}>
                    <input value={newItemName} onChange={e=>setNewItemName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addItem()} placeholder="소분류 추가"
                      style={{padding:"4px 10px",border:"1px solid #bbb",borderRadius:16,fontSize:12,width:100}}/>
                    <button onClick={addItem} style={{padding:"4px 9px",background:blue,color:white,border:"none",borderRadius:16,cursor:"pointer",fontSize:12}}>+</button>
                  </div>
                )}
              </div>
              {/* 범례 */}
              <div style={{marginTop:6,display:"flex",gap:10,fontSize:11,color:"#aaa"}}>
                <span>✓ 작성완료</span>
                <span style={{color:"#f87171"}}>● 미작성</span>
                {isAdmin&&showManage&&<span>⠿ 드래그로 순서변경</span>}
              </div>
            </div>
          )}

          {/* 미선택 안내 */}
          {!selectedSub&&!selectedItem&&(
            <div style={{background:white,borderRadius:10,border:`1px solid ${border}`,padding:"56px 24px",textAlign:"center",color:"#aaa"}}>
              <div style={{fontSize:44,marginBottom:12}}>📋</div>
              <div style={{fontSize:15,marginBottom:6,color:"#666"}}>왼쪽에서 카테고리를 선택하거나 상단 검색창을 이용하세요</div>
              <div style={{fontSize:13,marginBottom:4}}>대분류 → 중분류 → 소분류 순으로 선택하면 메뉴얼 내용이 표시됩니다</div>
              <div style={{fontSize:12,marginTop:10}}>💡 초성 검색 가능 — 예: "ㅈㅁ" → 주문, "ㄱㅈ" → 거래처, "ㄷㅇ" → 대응</div>
            </div>
          )}

          {/* 콘텐츠 */}
          {selectedItem&&(
            <div ref={contentRef} style={{background:white,borderRadius:10,border:`1px solid ${border}`,padding:"22px 24px"}}>
              {/* Breadcrumb */}
              <div style={{fontSize:12,color:"#aaa",marginBottom:14,display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                {categories.find(c=>c.id===selectedCat)?.name}
                <span>›</span>{subcategories.find(s=>s.id===selectedSub)?.name}
                <span>›</span>
                <span style={{color:blue,fontWeight:600}}>{menuItems.find(m=>m.id===selectedItem)?.name}</span>
              </div>

              {/* 관리자 수정 버튼 */}
              {isAdmin&&!editing&&(
                <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
                  <button onClick={startEdit}
                    style={{padding:"6px 16px",background:blueLt,color:blue,border:`1px solid ${blue}`,borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:600}}>
                    ✏️ {currentContent?"수정":"내용 작성"}
                  </button>
                </div>
              )}

              {/* ── 편집 모드 ── */}
              {editing?(
                <div>
                  <div style={{marginBottom:10}}>
                    <label style={{fontSize:12,color:"#666",display:"block",marginBottom:4}}>제목</label>
                    <input value={editTitle} onChange={e=>setEditTitle(e.target.value)}
                      style={{...inp,fontSize:15,fontWeight:600,padding:"8px 12px"}}/>
                  </div>
                  <div style={{marginBottom:10}}>
                    <label style={{fontSize:12,color:"#666",display:"block",marginBottom:4}}>내용</label>
                    <RteToolbar onFormat={handleFormat}/>
                    <textarea ref={textareaRef} value={editBody} onChange={e=>setEditBody(e.target.value)} rows={14}
                      style={{...inp,padding:"10px 12px",fontSize:13,resize:"vertical",lineHeight:1.75,fontFamily:"inherit"}}/>
                    <div style={{fontSize:11,color:"#bbb",marginTop:4}}>**굵게** / _기울임_ / ## 제목 / - 목록 / `코드` / --- 구분선</div>
                  </div>
                  <div style={{marginBottom:14}}>
                    <label style={{fontSize:12,color:"#666",display:"block",marginBottom:6}}>이미지</label>
                    {editImages.length>0&&(
                      <div style={{display:"flex",flexWrap:"wrap",gap:10,marginBottom:10}}>
                        {editImages.map((url,i)=>(
                          <div key={i} style={{position:"relative"}}>
                            <img src={url} onClick={()=>setLightbox(url)} style={{width:110,height:82,objectFit:"cover",borderRadius:6,border:"1px solid #e0e0e0",cursor:"pointer"}}/>
                            <button onClick={()=>removeImage(url)} style={{position:"absolute",top:-6,right:-6,background:"#e53e3e",color:white,border:"none",borderRadius:"50%",width:20,height:20,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <input ref={fileInputRef} type="file" multiple accept="image/*" onChange={handleImageUpload} style={{display:"none"}}/>
                      <button onClick={()=>fileInputRef.current?.click()} disabled={uploading}
                        style={{padding:"7px 16px",background:uploading?"#ccc":blueLt,color:uploading?white:blue,border:`1px solid ${blue}`,borderRadius:6,cursor:uploading?"not-allowed":"pointer",fontSize:13}}>
                        {uploading?"업로드 중...":"🖼 이미지 추가"}
                      </button>
                      <span style={{fontSize:12,color:"#aaa"}}>여러 장 선택 가능</span>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                    <button onClick={saveContent} style={{padding:"8px 20px",background:blue,color:white,border:"none",borderRadius:6,cursor:"pointer",fontWeight:600,fontSize:14}}>저장</button>
                    <button onClick={()=>setEditing(false)} style={{padding:"8px 16px",background:"#f0f0f0",border:"none",borderRadius:6,cursor:"pointer",fontSize:14}}>취소</button>
                  </div>
                </div>
              ):currentContent?(
                /* ── 보기 모드 ── */
                <div>
                  <h2 style={{fontSize:21,fontWeight:700,color:"#1a1a2e",marginBottom:14,borderBottom:`2px solid ${blueLt}`,paddingBottom:12}}>
                    {currentContent.title||menuItems.find(m=>m.id===selectedItem)?.name}
                  </h2>
                  {/* 마크다운 렌더링 */}
                  <div style={{fontSize:14,lineHeight:1.8,color:"#444",marginBottom:currentContent.image_urls?.length?22:0}}
                    dangerouslySetInnerHTML={{__html:renderBody(currentContent.body)}}/>
                  {/* 이미지 */}
                  {currentContent.image_urls?.length>0&&(
                    <div>
                      <div style={{fontSize:12,color:"#aaa",marginBottom:10,paddingTop:8,borderTop:"1px solid #f0f0f0"}}>
                        이미지 {currentContent.image_urls.length}장 · 클릭하면 확대
                      </div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
                        {currentContent.image_urls.map((url,i)=>(
                          <img key={i} src={url} onClick={()=>setLightbox(url)}
                            style={{width:180,height:135,objectFit:"cover",borderRadius:8,border:"1px solid #e0e0e0",cursor:"zoom-in",transition:"transform 0.15s,box-shadow 0.15s"}}
                            onMouseEnter={e=>{const el=e.target as HTMLElement;el.style.transform="scale(1.04)";el.style.boxShadow="0 4px 16px rgba(0,0,0,0.15)";}}
                            onMouseLeave={e=>{const el=e.target as HTMLElement;el.style.transform="";el.style.boxShadow="";}}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {/* 최종수정자 + 수정시각 */}
                  <div style={{marginTop:18,display:"flex",alignItems:"center",gap:8,fontSize:11,color:"#ccc",borderTop:"1px solid #f5f5f5",paddingTop:10}}>
                    {currentContent.updated_by&&(
                      <span style={{background:"#f0f4ff",color:blue,borderRadius:10,padding:"2px 8px",fontWeight:600}}>
                        ✏️ {currentContent.updated_by}
                      </span>
                    )}
                    <span>최종 수정: {new Date(currentContent.updated_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}</span>
                  </div>
                </div>
              ):(
                /* 내용 없음 */
                <div style={{textAlign:"center",padding:"44px 24px",color:"#bbb"}}>
                  <div style={{fontSize:34,marginBottom:10}}>📝</div>
                  <div style={{fontSize:14}}>아직 작성된 내용이 없습니다</div>
                  {isAdmin&&<div style={{fontSize:13,marginTop:6,color:"#999"}}>위의 '내용 작성' 버튼을 눌러 입력해주세요</div>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── TOP 버튼 ── */}
      <button onClick={()=>window.scrollTo({top:0,behavior:"smooth"})} title="맨 위로"
        style={{position:"fixed",bottom:28,right:24,width:42,height:42,borderRadius:"50%",background:blue,color:white,border:"none",cursor:"pointer",fontSize:16,boxShadow:"0 4px 16px rgba(45,91,227,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:500,transition:"transform 0.15s"}}
        onMouseEnter={e=>(e.currentTarget.style.transform="scale(1.12)")}
        onMouseLeave={e=>(e.currentTarget.style.transform="")}>▲</button>

      {/* ── 반응형 CSS ── */}
      <style>{`
        @media (max-width: 768px) {
          .manual-hamburger { display: flex !important; }
          .manual-sidebar-desktop { display: none !important; }
          .manual-subtitle-hide { display: none !important; }
        }
      `}</style>
    </div>
  );
}
