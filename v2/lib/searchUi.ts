export function isActiveHouseholdSearch(query: string): boolean {
  return query.trim().length > 0;
}

export function shouldHideBottomNavForSearch(query: string): boolean {
  void query;
  return false;
}

export function shouldShowSearchClearButton(query: string): boolean {
  return query.length > 0;
}
