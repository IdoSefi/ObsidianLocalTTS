export class StatusView {
  private text = "Idle";

  setText(value: string): void {
    this.text = value;
  }

  getText(): string {
    return this.text;
  }
}
