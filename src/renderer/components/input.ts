export const SettingInput = (
  key: string,
  type: 'port' | 'text',
  value: string | number,
  placeholder: string | number,
  style = ''
) => {
  if (type === 'text') {
    return `
    <div class="q-input" style="${style}">
      <input class="q-input__inner" data-config-key="${key}" type="text" value="${value}" placeholder="${placeholder}" />
    </div>
    `
  }
  return `
  <div class="q-input" style="${style}">
    <input class="q-input__inner" data-config-key="${key}" type="number" min="1" max="65534" value="${value}" placeholder="${placeholder}" />
  </div>
  `
}
