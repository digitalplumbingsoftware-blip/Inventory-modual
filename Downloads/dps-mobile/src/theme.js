export const C = {
  bg:       '#0b0e13',
  surface:  '#111520',
  surface2: '#171d2a',
  surface3: '#1e2535',
  border:   '#232b3e',
  border2:  '#2d3a52',
  amber:    '#f5a623',
  blue:     '#4a9eff',
  green:    '#3ecf8e',
  red:      '#f56565',
  purple:   '#a78bfa',
  cyan:     '#22d3ee',
  text:     '#e2e8f5',
  muted:    '#64748b',
  dim:      '#3d4f6e',
};

export const STATUS = {
  scheduled: { color: C.muted,   label: 'SCHEDULED' },
  en_route:  { color: C.blue,    label: 'EN ROUTE'  },
  on_site:   { color: C.amber,   label: 'ON SITE'   },
  completed: { color: C.green,   label: 'COMPLETED' },
  cancelled: { color: C.dim,     label: 'CANCELLED' },
};
