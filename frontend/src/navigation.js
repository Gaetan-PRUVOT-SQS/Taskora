// navigation vers une autre origine (GitHub), isolée pour pouvoir la simuler en test
export function goTo(url) {
  window.location.assign(url);
}
