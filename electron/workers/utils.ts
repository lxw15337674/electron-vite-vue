import { format, formatDistance, formatRelative, subDays } from 'date-fns'

export const getDate = () => {
    return formatRelative(subDays(new Date(), 3), new Date())
}
