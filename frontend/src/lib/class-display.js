export function classSchedule(event,locale){
  const formatter=new Intl.DateTimeFormat(locale,{timeZone:event.timezone,dateStyle:'medium',timeStyle:'short'})
  const start=new Date(event.startsAt),end=new Date(event.endsAt)
  return formatter.formatRange?formatter.formatRange(start,end):formatter.format(start)+' – '+formatter.format(end)
}
