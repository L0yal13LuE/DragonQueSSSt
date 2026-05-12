class QueueNode<T> {
  value: T;
  next: QueueNode<T> | null = null;
  constructor(value: T) {
    this.value = value;
  }
}

class Queue<T> {
  head: QueueNode<T> | null = null;
  tail: QueueNode<T> | null = null;
  size: number = 0;

  enqueue(item: T): number {
    const newNode = new QueueNode(item);
    if (!this.head) {
      this.head = newNode;
      this.tail = newNode;
    } else {
      if (this.tail) this.tail.next = newNode;
      this.tail = newNode;
    }
    this.size++;
    return this.size;
  }

  dequeue(): T | null {
    if (!this.head) return null;
    const value = this.head.value;
    this.head = this.head.next;
    if (!this.head) this.tail = null;
    this.size--;
    return value;
  }

  isEmpty(): boolean {
    return this.size === 0;
  }
}

class AsyncQueue<T> {
  private queue: Queue<T> = new Queue();
  private worker: (item: T) => Promise<void>;
  private isProcessing: boolean = false;

  constructor(workerFunction: (item: T) => Promise<void>) {
    this.worker = workerFunction;
  }

  enqueue(item: T): number {
    const newSize = this.queue.enqueue(item);
    this.process();
    return newSize;
  }

  private async process(): Promise<void> {
    if (this.isProcessing || this.queue.isEmpty()) {
      return;
    }
    this.isProcessing = true;
    const item = this.queue.dequeue();
    if (item === null) {
      this.isProcessing = false;
      return;
    }
    try {
      await this.worker(item);
    } catch (error) {
      console.error("[AsyncQueue] Error inside worker function:", error);
    } finally {
      this.isProcessing = false;
      process.nextTick(() => this.process());
    }
  }

  getSize(): number {
    return this.queue.size;
  }

  getIsProcessing(): boolean {
    return this.isProcessing;
  }
}

export { AsyncQueue };
export default AsyncQueue;
