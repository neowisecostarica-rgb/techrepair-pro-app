// Pure calendar contract: no scheduler, external effects or writes.
// An occurrence key identifies a civil slot; a durable UNIQUE reservation
// must be acquired before any unattended snapshot can be generated.
export function scheduleOccurrence(schedule, instant, scopeKey, days) {
 if (!schedule?.requested || !['daily','weekly','monthly'].includes(schedule.frequency) || !Number.isFinite(instant.getTime())) return null;
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:schedule.timezone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(instant).map(p=>[p.type,p.value]));
 const weekday=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(parts.weekday)+1;
 const date=parts.year+'-'+parts.month+'-'+parts.day;
 const clock=parts.hour+':'+parts.minute;
 if(clock<schedule.time || (schedule.frequency==='weekly'&&weekday!==schedule.weekday) || (schedule.frequency==='monthly'&&Number(parts.day)!==schedule.monthday))return null;
 return {date,time:schedule.time,timezone:schedule.timezone,key:JSON.stringify([scopeKey,days,date,schedule.time,schedule.timezone]),automatic:false};
}
