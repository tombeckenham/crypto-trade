/**
 * Red-Black tree node colors used to maintain balance properties
 * 
 * Red-Black trees were chosen because they provide:
 * 1. Guaranteed O(log n) performance for all operations
 * 2. Self-balancing to prevent degradation
 * 3. Efficient ordered iteration for market depth
 * 4. Predictable latency for real-time trading
 * 5. Memory efficiency without pre-allocation

 * The alternatives either had:
 * - Unpredictable performance (arrays, skip lists)
 * - Missing critical operations (heaps can't iterate efficiently)
 * - Unnecessary complexity (B+ trees are overkill for in-memory)

 * For high-frequency trading where consistent sub-millisecond latency is critical, Red-Black trees provide the optimal balance of guaranteed performance across all required operations.
 * RED = 0: Red nodes allow for insertions/deletions without immediate rebalancing
 * BLACK = 1: Black nodes maintain the height balance constraint
 */
enum Color {
  RED = 0,
  BLACK = 1
}

/**
 * Red-Black Tree Node interface
 * Each node contains a key-value pair and maintains tree structure through pointers
 * Color property ensures O(log n) operations by maintaining balance invariants
 */
export interface RBNode<K, V> {
  key: K;                           // The sorting key for this node
  value: V;                         // The data stored at this node
  color: Color;                     // RED or BLACK for balancing
  left: RBNode<K, V> | null;       // Left child (smaller keys)
  right: RBNode<K, V> | null;      // Right child (larger keys)  
  parent: RBNode<K, V> | null;     // Parent node for efficient traversal
}

/**
 * Self-balancing binary search tree optimized for trading order books
 * Guarantees O(log n) insert, delete, and search operations
 * Used for efficient price level management in high-frequency trading
 * 
 * Key properties:
 * - All RED nodes have BLACK children (no consecutive RED nodes)
 * - Every path from root to leaf contains same number of BLACK nodes
 * - Root is always BLACK
 * - New insertions are always RED initially
 */
export class RedBlackTree<K, V> {
  private root: RBNode<K, V> | null = null;     // Root of the tree
  private size = 0;                             // Total number of nodes for O(1) size queries
  private readonly compareFn: (a: K, b: K) => number;  // Custom comparison function for ordering

  /**
   * Creates a new Red-Black Tree with custom comparison function
   * @param compareFn - Function that returns <0 if a<b, 0 if a==b, >0 if a>b
   *                   For price levels: (a,b) => a-b for ascending, (a,b) => b-a for descending
   */
  constructor(compareFn: (a: K, b: K) => number) {
    this.compareFn = compareFn;
  }

  /**
   * Inserts a key-value pair into the tree
   * If key exists, updates the value; otherwise creates new node
   * Maintains Red-Black tree properties through rebalancing
   * Time complexity: O(log n)
   * @param key - The key to insert/update
   * @param value - The value to store
   */
  insert(key: K, value: V): void {
    // Create new node with RED color (standard Red-Black tree insertion)
    const newNode: RBNode<K, V> = {
      key,
      value,
      color: Color.RED,    // New nodes are always RED to minimize rebalancing
      left: null,
      right: null,
      parent: null
    };

    // Handle empty tree case - root must be BLACK
    if (!this.root) {
      this.root = newNode;
      this.root.color = Color.BLACK;  // Root is always BLACK (Red-Black property)
      this.size++;
      return;
    }

    // Find insertion point using binary search
    let current = this.root;
    let parent: RBNode<K, V> | null = null;

    while (current) {
      parent = current;
      const cmp = this.compareFn(key, current.key);
      if (cmp < 0) {
        current = current.left!;   // Go left for smaller keys
      } else if (cmp > 0) {
        current = current.right!;  // Go right for larger keys
      } else {
        // Key already exists - update value and return
        current.value = value;
        return;
      }
    }

    // Insert new node as child of found parent
    newNode.parent = parent;
    if (this.compareFn(key, parent!.key) < 0) {
      parent!.left = newNode;   // Insert as left child
    } else {
      parent!.right = newNode;  // Insert as right child
    }

    this.size++;
    // Restore Red-Black properties that may have been violated
    this.fixAfterInsertion(newNode);
  }

  /**
   * Removes a node with the given key from the tree
   * Maintains Red-Black tree properties through rebalancing
   * Time complexity: O(log n)
   * @param key - The key to remove
   * @returns The value that was removed, or null if key not found
   */
  remove(key: K): V | null {
    const node = this.findNode(key);
    if (!node) return null;

    const value = node.value;
    this.deleteNode(node);
    this.size--;
    return value;
  }

  /**
   * Finds a value by its key
   * Time complexity: O(log n)
   * @param key - The key to search for
   * @returns The value associated with the key, or null if not found
   */
  find(key: K): V | null {
    const node = this.findNode(key);
    return node ? node.value : null;
  }

  /**
   * Finds the minimum key-value pair in the tree
   * Critical for getting best bid/ask prices in order book
   * Time complexity: O(log n)
   * @returns Object with minimum key and its value, or null if tree is empty
   */
  findMin(): { key: K; value: V } | null {
    if (!this.root) return null;
    const node = this.findMinNode(this.root);
    return { key: node.key, value: node.value };
  }

  /**
   * Finds the maximum key-value pair in the tree
   * Critical for getting best bid/ask prices in order book
   * Time complexity: O(log n)
   * @returns Object with maximum key and its value, or null if tree is empty
   */
  findMax(): { key: K; value: V } | null {
    if (!this.root) return null;
    const node = this.findMaxNode(this.root);
    return { key: node.key, value: node.value };
  }

  /**
   * Returns the number of nodes in the tree
   * Time complexity: O(1)
   * @returns Total count of key-value pairs
   */
  getSize(): number {
    return this.size;
  }

  /**
   * Checks if the tree is empty
   * Time complexity: O(1)
   * @returns True if tree contains no nodes
   */
  isEmpty(): boolean {
    return this.size === 0;
  }

  /**
   * Iterator for in-order traversal (sorted key order)
   * Essential for displaying ordered price levels in trading UI
   * Time complexity: O(n) for full traversal
   * @returns Iterator yielding key-value pairs in sorted order
   */
  *inOrderTraversal(): IterableIterator<{ key: K; value: V }> {
    yield* this.inOrderTraversalNode(this.root);
  }

  /**
   * Iterator for reverse in-order traversal (reverse sorted key order)
   * Used for displaying price levels from highest to lowest
   * Time complexity: O(n) for full traversal
   * @returns Iterator yielding key-value pairs in reverse sorted order
   */
  *reverseOrderTraversal(): IterableIterator<{ key: K; value: V }> {
    yield* this.reverseOrderTraversalNode(this.root);
  }

  /**
   * Recursive helper for in-order traversal
   * Visits nodes in: left subtree → current node → right subtree
   */
  private *inOrderTraversalNode(node: RBNode<K, V> | null): IterableIterator<{ key: K; value: V }> {
    if (!node) return;
    yield* this.inOrderTraversalNode(node.left);   // Process left subtree first
    yield { key: node.key, value: node.value };    // Yield current node
    yield* this.inOrderTraversalNode(node.right);  // Process right subtree last
  }

  /**
   * Recursive helper for reverse in-order traversal
   * Visits nodes in: right subtree → current node → left subtree
   */
  private *reverseOrderTraversalNode(node: RBNode<K, V> | null): IterableIterator<{ key: K; value: V }> {
    if (!node) return;
    yield* this.reverseOrderTraversalNode(node.right);  // Process right subtree first
    yield { key: node.key, value: node.value };         // Yield current node
    yield* this.reverseOrderTraversalNode(node.left);   // Process left subtree last
  }

  /**
   * Internal method to find a node by key using binary search
   * @param key - The key to search for
   * @returns The node containing the key, or null if not found
   */
  private findNode(key: K): RBNode<K, V> | null {
    let current = this.root;
    while (current) {
      const cmp = this.compareFn(key, current.key);
      if (cmp < 0) {
        current = current.left;   // Search left subtree
      } else if (cmp > 0) {
        current = current.right;  // Search right subtree
      } else {
        return current;           // Found exact match
      }
    }
    return null;  // Key not found
  }

  /**
   * Finds the minimum node in a subtree (leftmost node)
   * @param node - Root of subtree to search
   * @returns The node with minimum key in the subtree
   */
  private findMinNode(node: RBNode<K, V>): RBNode<K, V> {
    // Keep going left until we find a leaf
    while (node.left) {
      node = node.left;
    }
    return node;
  }

  /**
   * Finds the maximum node in a subtree (rightmost node)
   * @param node - Root of subtree to search
   * @returns The node with maximum key in the subtree
   */
  private findMaxNode(node: RBNode<K, V>): RBNode<K, V> {
    // Keep going right until we find a leaf
    while (node.right) {
      node = node.right;
    }
    return node;
  }

  /**
   * Performs left rotation to maintain Red-Black tree balance
   * Transforms: node-right becomes new root, node becomes left child
   * Critical for rebalancing after insertions/deletions
   * @param node - The node to rotate around
   */
  private rotateLeft(node: RBNode<K, V>): void {
    const right = node.right!;  // Right child becomes new root

    // Move right's left subtree to node's right
    node.right = right.left;
    if (right.left) {
      right.left.parent = node;
    }

    // Connect right to node's parent
    right.parent = node.parent;
    if (!node.parent) {
      this.root = right;  // right becomes new root
    } else if (node === node.parent.left) {
      node.parent.left = right;
    } else {
      node.parent.right = right;
    }

    // Make node the left child of right
    right.left = node;
    node.parent = right;
  }

  /**
   * Performs right rotation to maintain Red-Black tree balance
   * Transforms: node-left becomes new root, node becomes right child
   * Critical for rebalancing after insertions/deletions
   * @param node - The node to rotate around
   */
  private rotateRight(node: RBNode<K, V>): void {
    const left = node.left!;  // Left child becomes new root

    // Move left's right subtree to node's left
    node.left = left.right;
    if (left.right) {
      left.right.parent = node;
    }

    // Connect left to node's parent
    left.parent = node.parent;
    if (!node.parent) {
      this.root = left;  // left becomes new root
    } else if (node === node.parent.right) {
      node.parent.right = left;
    } else {
      node.parent.left = left;
    }

    // Make node the right child of left
    left.right = node;
    node.parent = left;
  }

  /**
   * Restores Red-Black tree properties after insertion
   * Handles cases where new RED node creates consecutive RED nodes
   * Uses rotations and recoloring to maintain balance
   * @param node - The newly inserted node to fix violations around
   */
  private fixAfterInsertion(node: RBNode<K, V>): void {
    // Fix violations: consecutive RED nodes violate Red-Black properties
    while (node !== this.root && node.parent!.color === Color.RED) {
      if (node.parent === node.parent!.parent!.left) {
        // Parent is left child of grandparent
        const uncle = node.parent!.parent!.right;
        if (uncle && uncle.color === Color.RED) {
          // Case 1: Uncle is RED - recolor and move up
          node.parent!.color = Color.BLACK;
          uncle.color = Color.BLACK;
          node.parent!.parent!.color = Color.RED;
          node = node.parent!.parent!;  // Continue fixing from grandparent
        } else {
          // Uncle is BLACK - rotation needed
          if (node === node.parent!.right) {
            // Case 2: Node is right child - convert to Case 3
            node = node.parent!;
            this.rotateLeft(node);
          }
          // Case 3: Node is left child - final rotation
          node.parent!.color = Color.BLACK;
          node.parent!.parent!.color = Color.RED;
          this.rotateRight(node.parent!.parent!);
        }
      } else {
        // Parent is right child of grandparent (mirror cases)
        const uncle = node.parent!.parent!.left;
        if (uncle && uncle.color === Color.RED) {
          // Case 1: Uncle is RED - recolor and move up
          node.parent!.color = Color.BLACK;
          uncle.color = Color.BLACK;
          node.parent!.parent!.color = Color.RED;
          node = node.parent!.parent!;  // Continue fixing from grandparent
        } else {
          // Uncle is BLACK - rotation needed
          if (node === node.parent!.left) {
            // Case 2: Node is left child - convert to Case 3
            node = node.parent!;
            this.rotateRight(node);
          }
          // Case 3: Node is right child - final rotation
          node.parent!.color = Color.BLACK;
          node.parent!.parent!.color = Color.RED;
          this.rotateLeft(node.parent!.parent!);
        }
      }
    }
    // Ensure root is always BLACK (fundamental Red-Black property)
    this.root!.color = Color.BLACK;
  }

  /**
   * Internal method to delete a node while maintaining Red-Black properties
   * Handles three cases: node with 0, 1, or 2 children
   * @param node - The node to delete
   */
  private deleteNode(node: RBNode<K, V>): void {
    let replacement: RBNode<K, V> | null;
    let child: RBNode<K, V> | null;

    // Find node to actually delete
    if (!node.left || !node.right) {
      // Node has at most one child - can delete directly
      replacement = node;
    } else {
      // Node has two children - replace with successor (min of right subtree)
      replacement = this.findMinNode(node.right);
    }

    // Get the child that will replace the deleted node
    child = replacement.left || replacement.right;

    // Connect child to replacement's parent
    if (child) {
      child.parent = replacement.parent;
    }

    // Update parent's pointer to child
    if (!replacement.parent) {
      this.root = child;  // Replacement was root
    } else if (replacement === replacement.parent.left) {
      replacement.parent.left = child;
    } else {
      replacement.parent.right = child;
    }

    // If we used successor, copy its data to the original node
    if (replacement !== node) {
      node.key = replacement.key;
      node.value = replacement.value;
    }

    // If we deleted a BLACK node, Red-Black properties may be violated
    if (replacement.color === Color.BLACK) {
      if (child) {
        this.fixAfterDeletion(child);
      }
    }
  }

  /**
   * Restores Red-Black tree properties after deletion
   * Handles cases where deleting BLACK node violates balance
   * Uses rotations and recoloring to restore invariants
   * @param node - The replacement node that may cause violations
   */
  private fixAfterDeletion(node: RBNode<K, V>): void {
    // Fix BLACK-height violations caused by deleting BLACK node
    while (node !== this.root && (!node || node.color === Color.BLACK)) {
      if (node === node.parent!.left) {
        // Node is left child - sibling is right child
        let sibling = node.parent!.right;
        if (sibling && sibling.color === Color.RED) {
          // Case 1: Sibling is RED - convert to other cases
          sibling.color = Color.BLACK;
          node.parent!.color = Color.RED;
          this.rotateLeft(node.parent!);
          sibling = node.parent!.right;
        }
        if (sibling &&
          (!sibling.left || sibling.left.color === Color.BLACK) &&
          (!sibling.right || sibling.right.color === Color.BLACK)) {
          // Case 2: Sibling and its children are BLACK
          sibling.color = Color.RED;
          node = node.parent!;  // Move problem up the tree
        } else {
          if (sibling && (!sibling.right || sibling.right.color === Color.BLACK)) {
            // Case 3: Sibling's right child is BLACK - prepare for Case 4
            if (sibling.left) sibling.left.color = Color.BLACK;
            sibling.color = Color.RED;
            this.rotateRight(sibling);
            sibling = node.parent!.right;
          }
          // Case 4: Sibling's right child is RED - final fix
          if (sibling) {
            sibling.color = node.parent!.color;
            if (sibling.right) sibling.right.color = Color.BLACK;
          }
          node.parent!.color = Color.BLACK;
          this.rotateLeft(node.parent!);
          node = this.root!;  // Problem solved
        }
      } else {
        // Node is right child - sibling is left child (mirror cases)
        let sibling = node.parent!.left;
        if (sibling && sibling.color === Color.RED) {
          // Case 1: Sibling is RED - convert to other cases
          sibling.color = Color.BLACK;
          node.parent!.color = Color.RED;
          this.rotateRight(node.parent!);
          sibling = node.parent!.left;
        }
        if (sibling &&
          (!sibling.right || sibling.right.color === Color.BLACK) &&
          (!sibling.left || sibling.left.color === Color.BLACK)) {
          // Case 2: Sibling and its children are BLACK
          sibling.color = Color.RED;
          node = node.parent!;  // Move problem up the tree
        } else {
          if (sibling && (!sibling.left || sibling.left.color === Color.BLACK)) {
            // Case 3: Sibling's left child is BLACK - prepare for Case 4
            if (sibling.right) sibling.right.color = Color.BLACK;
            sibling.color = Color.RED;
            this.rotateLeft(sibling);
            sibling = node.parent!.left;
          }
          // Case 4: Sibling's left child is RED - final fix
          if (sibling) {
            sibling.color = node.parent!.color;
            if (sibling.left) sibling.left.color = Color.BLACK;
          }
          node.parent!.color = Color.BLACK;
          this.rotateRight(node.parent!);
          node = this.root!;  // Problem solved
        }
      }
    }
    // Ensure final node is BLACK to maintain properties
    if (node) node.color = Color.BLACK;
  }
}