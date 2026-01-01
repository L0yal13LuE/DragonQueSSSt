// utils/AsyncQueue.js

// 1. Linked List Node
class Node {
    constructor(value) {
        this.value = value;
        this.next = null;
    }
}

// 2. The Data Structure
class Queue {
    constructor() {
        this.head = null;
        this.tail = null;
        this.size = 0;
    }

    enqueue(item) {
        const newNode = new Node(item);
        if (!this.head) {
            this.head = newNode;
            this.tail = newNode;
        } else {
            this.tail.next = newNode;
            this.tail = newNode;
        }
        this.size++;
        return this.size;
    }

    dequeue() {
        if (!this.head) return null;
        const value = this.head.value;
        this.head = this.head.next;
        if (!this.head) this.tail = null;
        this.size--;
        return value;
    }

    isEmpty() {
        return this.size === 0;
    }
}

// 3. The Queue Manager (The "Worker" Logic)
class AsyncQueue {
    /**
     * @param {Function} workerFunction - An async function that accepts an item and processes it.
     */
    constructor(workerFunction) {
        this.queue = new Queue();
        this.worker = workerFunction; // The injected function
        this.isProcessing = false;
    }

    /**
     * Add an item to the queue and trigger processing.
     * @param {*} item 
     */
    enqueue(item) {
        const newSize = this.queue.enqueue(item);
        this.process(); // Trigger processing immediately
        return newSize;
    }

    /**
     * Internal loop to process items one by one.
     */
    async process() {
        if (this.isProcessing || this.queue.isEmpty()) {
            return;
        }

        this.isProcessing = true;
        const item = this.queue.dequeue();

        try {
            // Execute the injected function
            await this.worker(item); 
        } catch (error) {
            console.error("[AsyncQueue] Error inside worker function:", error);
        } finally {
            this.isProcessing = false;
            // Recursively check for next item
            process.nextTick(() => this.process());
        }
    }

    getSize() {
        return this.queue.size;
    }

    getIsProcessing() {
        return this.isProcessing;
    }
}

module.exports = AsyncQueue;