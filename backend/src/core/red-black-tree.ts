enum Color {
  RED = 0,
  BLACK = 1
}

export interface RBNode<K, V> {
  key: K;
  value: V;
  color: Color;
  left: RBNode<K, V> | null;
  right: RBNode<K, V> | null;
  parent: RBNode<K, V> | null;
}

export class RedBlackTree<K, V> {
  private root: RBNode<K, V> | null = null;
  private size = 0;
  private readonly compareFn: (a: K, b: K) => number;

  constructor(compareFn: (a: K, b: K) => number) {
    this.compareFn = compareFn;
  }

  insert(key: K, value: V): void {
    const newNode: RBNode<K, V> = {
      key,
      value,
      color: Color.RED,
      left: null,
      right: null,
      parent: null
    };

    if (!this.root) {
      this.root = newNode;
      this.root.color = Color.BLACK;
      this.size++;
      return;
    }

    let current = this.root;
    let parent: RBNode<K, V> | null = null;

    while (current) {
      parent = current;
      const cmp = this.compareFn(key, current.key);
      if (cmp < 0) {
        current = current.left!;
      } else if (cmp > 0) {
        current = current.right!;
      } else {
        current.value = value;
        return;
      }
    }

    newNode.parent = parent;
    if (this.compareFn(key, parent!.key) < 0) {
      parent!.left = newNode;
    } else {
      parent!.right = newNode;
    }

    this.size++;
    this.fixAfterInsertion(newNode);
  }

  remove(key: K): V | null {
    const node = this.findNode(key);
    if (!node) return null;

    const value = node.value;
    this.deleteNode(node);
    this.size--;
    return value;
  }

  find(key: K): V | null {
    const node = this.findNode(key);
    return node ? node.value : null;
  }

  findMin(): { key: K; value: V } | null {
    if (!this.root) return null;
    const node = this.findMinNode(this.root);
    return { key: node.key, value: node.value };
  }

  findMax(): { key: K; value: V } | null {
    if (!this.root) return null;
    const node = this.findMaxNode(this.root);
    return { key: node.key, value: node.value };
  }

  getSize(): number {
    return this.size;
  }

  isEmpty(): boolean {
    return this.size === 0;
  }

  *inOrderTraversal(): IterableIterator<{ key: K; value: V }> {
    yield* this.inOrderTraversalNode(this.root);
  }

  *reverseOrderTraversal(): IterableIterator<{ key: K; value: V }> {
    yield* this.reverseOrderTraversalNode(this.root);
  }

  private *inOrderTraversalNode(node: RBNode<K, V> | null): IterableIterator<{ key: K; value: V }> {
    if (!node) return;
    yield* this.inOrderTraversalNode(node.left);
    yield { key: node.key, value: node.value };
    yield* this.inOrderTraversalNode(node.right);
  }

  private *reverseOrderTraversalNode(node: RBNode<K, V> | null): IterableIterator<{ key: K; value: V }> {
    if (!node) return;
    yield* this.reverseOrderTraversalNode(node.right);
    yield { key: node.key, value: node.value };
    yield* this.reverseOrderTraversalNode(node.left);
  }

  private findNode(key: K): RBNode<K, V> | null {
    let current = this.root;
    while (current) {
      const cmp = this.compareFn(key, current.key);
      if (cmp < 0) {
        current = current.left;
      } else if (cmp > 0) {
        current = current.right;
      } else {
        return current;
      }
    }
    return null;
  }

  private findMinNode(node: RBNode<K, V>): RBNode<K, V> {
    while (node.left) {
      node = node.left;
    }
    return node;
  }

  private findMaxNode(node: RBNode<K, V>): RBNode<K, V> {
    while (node.right) {
      node = node.right;
    }
    return node;
  }

  private rotateLeft(node: RBNode<K, V>): void {
    const right = node.right!;
    node.right = right.left;
    if (right.left) {
      right.left.parent = node;
    }
    right.parent = node.parent;
    if (!node.parent) {
      this.root = right;
    } else if (node === node.parent.left) {
      node.parent.left = right;
    } else {
      node.parent.right = right;
    }
    right.left = node;
    node.parent = right;
  }

  private rotateRight(node: RBNode<K, V>): void {
    const left = node.left!;
    node.left = left.right;
    if (left.right) {
      left.right.parent = node;
    }
    left.parent = node.parent;
    if (!node.parent) {
      this.root = left;
    } else if (node === node.parent.right) {
      node.parent.right = left;
    } else {
      node.parent.left = left;
    }
    left.right = node;
    node.parent = left;
  }

  private fixAfterInsertion(node: RBNode<K, V>): void {
    while (node !== this.root && node.parent!.color === Color.RED) {
      if (node.parent === node.parent!.parent!.left) {
        const uncle = node.parent!.parent!.right;
        if (uncle && uncle.color === Color.RED) {
          node.parent!.color = Color.BLACK;
          uncle.color = Color.BLACK;
          node.parent!.parent!.color = Color.RED;
          node = node.parent!.parent!;
        } else {
          if (node === node.parent!.right) {
            node = node.parent!;
            this.rotateLeft(node);
          }
          node.parent!.color = Color.BLACK;
          node.parent!.parent!.color = Color.RED;
          this.rotateRight(node.parent!.parent!);
        }
      } else {
        const uncle = node.parent!.parent!.left;
        if (uncle && uncle.color === Color.RED) {
          node.parent!.color = Color.BLACK;
          uncle.color = Color.BLACK;
          node.parent!.parent!.color = Color.RED;
          node = node.parent!.parent!;
        } else {
          if (node === node.parent!.left) {
            node = node.parent!;
            this.rotateRight(node);
          }
          node.parent!.color = Color.BLACK;
          node.parent!.parent!.color = Color.RED;
          this.rotateLeft(node.parent!.parent!);
        }
      }
    }
    this.root!.color = Color.BLACK;
  }

  private deleteNode(node: RBNode<K, V>): void {
    let replacement: RBNode<K, V> | null;
    let child: RBNode<K, V> | null;

    if (!node.left || !node.right) {
      replacement = node;
    } else {
      replacement = this.findMinNode(node.right);
    }

    child = replacement.left || replacement.right;

    if (child) {
      child.parent = replacement.parent;
    }

    if (!replacement.parent) {
      this.root = child;
    } else if (replacement === replacement.parent.left) {
      replacement.parent.left = child;
    } else {
      replacement.parent.right = child;
    }

    if (replacement !== node) {
      node.key = replacement.key;
      node.value = replacement.value;
    }

    if (replacement.color === Color.BLACK) {
      if (child) {
        this.fixAfterDeletion(child);
      }
    }
  }

  private fixAfterDeletion(node: RBNode<K, V>): void {
    while (node !== this.root && (!node || node.color === Color.BLACK)) {
      if (node === node.parent!.left) {
        let sibling = node.parent!.right;
        if (sibling && sibling.color === Color.RED) {
          sibling.color = Color.BLACK;
          node.parent!.color = Color.RED;
          this.rotateLeft(node.parent!);
          sibling = node.parent!.right;
        }
        if (sibling && 
            (!sibling.left || sibling.left.color === Color.BLACK) &&
            (!sibling.right || sibling.right.color === Color.BLACK)) {
          sibling.color = Color.RED;
          node = node.parent!;
        } else {
          if (sibling && (!sibling.right || sibling.right.color === Color.BLACK)) {
            if (sibling.left) sibling.left.color = Color.BLACK;
            sibling.color = Color.RED;
            this.rotateRight(sibling);
            sibling = node.parent!.right;
          }
          if (sibling) {
            sibling.color = node.parent!.color;
            if (sibling.right) sibling.right.color = Color.BLACK;
          }
          node.parent!.color = Color.BLACK;
          this.rotateLeft(node.parent!);
          node = this.root!;
        }
      } else {
        let sibling = node.parent!.left;
        if (sibling && sibling.color === Color.RED) {
          sibling.color = Color.BLACK;
          node.parent!.color = Color.RED;
          this.rotateRight(node.parent!);
          sibling = node.parent!.left;
        }
        if (sibling && 
            (!sibling.right || sibling.right.color === Color.BLACK) &&
            (!sibling.left || sibling.left.color === Color.BLACK)) {
          sibling.color = Color.RED;
          node = node.parent!;
        } else {
          if (sibling && (!sibling.left || sibling.left.color === Color.BLACK)) {
            if (sibling.right) sibling.right.color = Color.BLACK;
            sibling.color = Color.RED;
            this.rotateLeft(sibling);
            sibling = node.parent!.left;
          }
          if (sibling) {
            sibling.color = node.parent!.color;
            if (sibling.left) sibling.left.color = Color.BLACK;
          }
          node.parent!.color = Color.BLACK;
          this.rotateRight(node.parent!);
          node = this.root!;
        }
      }
    }
    if (node) node.color = Color.BLACK;
  }
}