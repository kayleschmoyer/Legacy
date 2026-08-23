export class DraftPom {
  constructor(private page) {}
  async goto(leagueId: number): Promise<void> {
    await this.page.goto(`/league/${leagueId}/draft`);
  }
}
