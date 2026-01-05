const DAY_MAP: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
}

const generateHourlySlots = (from: string, to: string): string[] => {
  const slots: string[] = []

  let [hour] = from.split(':').map(Number)
  const [endHour] = to.split(':').map(Number)

  while (hour < endHour) {
    slots.push(`${hour.toString().padStart(2, '0')}:00`)
    hour++
  }

  return slots
}
