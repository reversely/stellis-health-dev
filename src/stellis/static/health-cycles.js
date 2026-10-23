/** Summaries and figures for named health cycles with recorded episodes. */
(function(root) {
  'use strict';
  const calendarDates=root.StellisCalendarDates;

  function summarizeCycle(cycle,today=calendarDates.formatDate(new Date())) {
    const episodes=[...cycle.episodes].filter(episode=>episode.startDate<=today).sort((first,second)=>second.startDate.localeCompare(first.startDate));
    if(!episodes.length)return {id:cycle.id,label:cycle.label,episodeCount:0};
    const latestEpisode=episodes[0];
    const intervals=episodes.slice(0,-1).map((episode,index)=>calendarDates.daysBetween(episode.startDate,episodes[index+1].startDate));
    const averageLength=intervals.length?Math.round(intervals.reduce((sum,length)=>sum+length,0)/intervals.length):null;
    return {
      id:cycle.id,label:cycle.label,episodeCount:episodes.length,latestEpisode,
      day:calendarDates.daysBetween(today,latestEpisode.startDate)+1,
      averageLength,intervalCount:intervals.length,
      estimatedNextStart:averageLength?calendarDates.shiftDate(latestEpisode.startDate,averageLength):null,
    };
  }

  function summarizeCycles(cycles,today) {
    return cycles.map(cycle=>summarizeCycle(cycle,today));
  }

  function createDayFigure({day,label,startDate,locale}) {
    const createElement=root.StellisDom.el;
    const figure=createElement('figure',null,'health-cycle-figure');
    const startLabel=calendarDates.parseDate(startDate).toLocaleDateString(locale,{month:'short',day:'numeric',year:'numeric'});
    figure.setAttribute('role','img');
    figure.setAttribute('aria-label',`Day ${day} of ${label} / Started ${startLabel}`);
    figure.append(createElement('span','Day','health-cycle-day-label'),createElement('strong',String(day),'health-cycle-day-number'),
      createElement('span','of '+label,'health-cycle-day-context'),createElement('figcaption','Started '+startLabel));
    return figure;
  }

  const exported={summarizeCycle,summarizeCycles,createDayFigure};
  root.StellisHealthCycles=exported;
  if(typeof module!=='undefined')module.exports=exported;
})(typeof window!=='undefined'?window:globalThis);
