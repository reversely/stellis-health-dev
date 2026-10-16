/* Bounded encrypted conversation snapshot format shared by both browser origins. */
window.StellisSnapshot = (() => {
  const encoder=new TextEncoder();
  function partsFor(snapshot,segments,highlights) {
    const parts=[];let current=[];
    for (const segment of segments) {
      const matching=highlights.filter(item=>item.segment_id===segment.id).map(item=>({quote:item.quote,start_offset:item.start_offset,end_offset:item.end_offset}));
      const reduced={id:segment.id,start_ms:segment.start_ms,end_ms:segment.end_ms,text:segment.text,
        speaker:segment.speaker_display_name,uncertain:segment.speaker_uncertain,person_id:segment.person_id||null,highlights:matching};
      const candidate=[...current,reduced];
      if(current.length&&(candidate.length>10||encoder.encode(JSON.stringify(candidate)).length>45000)){
        parts.push(current);current=[];
      }
      current.push(reduced);
      if(encoder.encode(JSON.stringify(current)).length>45000)throw Error('A passage is too large to sync');
    }
    if(current.length)parts.push(current);
    return parts.map((value,index)=>({kind:'conversation_part',snapshot_id:snapshot,index,total:parts.length,segments:value}));
  }
  function assemble(manifest,partById) {
    if(!Array.isArray(manifest.part_ids)||!manifest.part_ids.length||new Set(manifest.part_ids).size!==manifest.part_ids.length)return null;
    const selected=manifest.part_ids.map(id=>partById.get(id));
    if(selected.some((part,index)=>!part||part.kind!=='conversation_part'||part.snapshot_id!==manifest.snapshot_id||
        part.index!==index||part.total!==selected.length||!Array.isArray(part.segments)))return null;
    const segments=selected.flatMap(part=>part.segments);
    if(segments.length!==manifest.segment_count||new Set(segments.map(item=>item.id)).size!==segments.length)return null;
    if(segments.some(item=>!Number.isInteger(item.start_ms)||item.start_ms<0||!Number.isInteger(item.end_ms)||item.end_ms<item.start_ms||
        typeof item.id!=='string'||typeof item.text!=='string'))return null;
    return segments;
  }
  return {partsFor,assemble};
})();
